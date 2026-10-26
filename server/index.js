import express from 'express'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { openDatabase } from './db.js'
import {
  id,
  hash,
  passwordHash,
  passwordMatches,
  normalizeDomains,
  allowedOrigin,
  cleanText,
  cleanPath,
  csv,
  visitFilter,
  validDate,
} from './core.js'
import { ingest, ingestReplay } from './ingest.js'
import {
  overview,
  breakdown,
  goalReport,
  funnelReport,
  behavior,
  visitsReport,
  commerceReport,
  acquisitionReport,
  mapSnapshot,
  insights,
} from './reports.js'
import { importBusiness, businessReport } from './business.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const wrap = (handler) => (req, res, next) => {
  try {
    Promise.resolve(handler(req, res, next)).catch(next)
  } catch (e) {
    next(e)
  }
}
export function createApp({ db = openDatabase(), demo = false, readOnly = false } = {}) {
  const app = express(),
    limits = new Map()
  app.disable('x-powered-by')
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'SAMEORIGIN',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    })
    if (!req.path.startsWith('/collect'))
      res.set(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self'; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'",
      )
    next()
  })
  const rate = (key, max, window = 60000) => {
    const now = Date.now()
    if (limits.size > 20000) for (const [k, v] of limits) if (v.until < now) limits.delete(k)
    const prev = limits.get(key)
    const entry = prev && prev.until > now ? prev : { n: 0, until: now + window }
    entry.n++
    limits.set(key, entry)
    return entry.n <= max
  }
  // Collection is public by design; the site domain allowlist is checked before parsing.
  app.use('/collect/:siteId', (req, res, next) => {
    const site = db.prepare('SELECT * FROM sites WHERE id=?').get(req.params.siteId)
    if (!site || !allowedOrigin(site, req.get('origin')))
      return res.status(403).json({ error: 'Домен не разрешён' })
    req.site = site
    res.set({
      'Access-Control-Allow-Origin': req.get('origin'),
      Vary: 'Origin',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store',
    })
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    if (!rate(`collect:${req.ip}:${site.id}`, 600))
      return res.status(429).json({ error: 'Слишком много событий' })
    next()
  })
  app.use(express.json({ limit: '3mb', type: ['application/json', 'text/plain'] }))
  app.post(
    '/collect/:siteId',
    wrap((req, res) => res.json(ingest(db, req.site, req.body, req.get('user-agent')))),
  )
  app.post(
    '/collect/:siteId/replay',
    wrap((req, res) => res.json(ingestReplay(db, req.site, req.body))),
  )
  app.get('/om.js', (req, res) => {
    res.removeHeader('Content-Security-Policy')
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': demo ? 'no-store' : 'public,max-age=300',
    })
    res.sendFile(resolve(root, 'public/om.js'))
  })
  app.get('/api/health', (req, res) => res.json({ ok: true, version: '0.2.0' }))
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store')
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (readOnly) return res.status(403).json({ error: 'Публичное демо доступно для просмотра' })
      const origin = req.get('origin'),
        own = `${req.protocol}://${req.get('host')}`
      if (origin && origin !== own && origin !== process.env.PUBLIC_ORIGIN)
        return res.status(403).json({ error: 'Недопустимый источник запроса' })
      if (!req.is('application/json'))
        return res.status(415).json({ error: 'Ожидается application/json' })
    }
    const raw = req.headers.cookie
      ?.split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('om_session='))
      ?.slice(11)
    if (raw)
      req.user = db
        .prepare(
          'SELECT u.* FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?',
        )
        .get(hash(raw), Date.now())
    const bearer = req.get('authorization')?.match(/^Bearer (.+)$/)?.[1]
    if (bearer) {
      const integration = db
        .prepare('SELECT * FROM integration_keys WHERE hash=?')
        .get(hash(bearer))
      if (integration) {
        if (req.method !== 'POST' || req.path !== `/sites/${integration.site_id}/business/import`)
          return res
            .status(403)
            .json({ error: 'Этот ключ разрешает только импорт продаж своего счётчика' })
        req.integrationKey = integration
        const site = db.prepare('SELECT owner_id FROM sites WHERE id=?').get(integration.site_id)
        req.user = db.prepare('SELECT * FROM users WHERE id=?').get(site.owner_id)
        return next()
      }
      const key = db.prepare('SELECT * FROM api_keys WHERE hash=?').get(hash(bearer))
      if (!key || req.method !== 'GET')
        return res.status(401).json({ error: 'Недействительный ключ или ключ только для чтения' })
      if (key && req.method === 'GET') {
        req.apiKey = key
        const site = db.prepare('SELECT owner_id FROM sites WHERE id=?').get(key.site_id)
        req.user = db.prepare('SELECT * FROM users WHERE id=?').get(site.owner_id)
      }
    }
    if (demo && !req.user)
      req.user = db.prepare('SELECT * FROM users ORDER BY created_at LIMIT 1').get()
    next()
  })
  const userOut = (user) => (user ? { id: user.id, name: user.name, email: user.email } : null)
  const setCookie = (res, token) =>
    res.cookie('om_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.COOKIE_SECURE === '1',
      maxAge: 7 * 86400000,
      path: '/',
    })
  app.get('/api/me', (req, res) =>
    res.json({
      user: userOut(req.user),
      setup: !db.prepare('SELECT 1 FROM users LIMIT 1').get(),
      demo,
      readOnly,
    }),
  )
  app.post(
    '/api/setup',
    wrap((req, res) => {
      if (db.prepare('SELECT 1 FROM users LIMIT 1').get())
        return res.status(409).json({ error: 'Администратор уже создан' })
      const { email, password, name } = req.body || {}
      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '') ||
        typeof password !== 'string' ||
        password.length < 12 ||
        password.length > 256 ||
        !cleanText(name)
      )
        return res.status(400).json({ error: 'Укажите имя, email и пароль от 12 до 256 символов' })
      const uid = id()
      db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(
        uid,
        email.toLowerCase().slice(0, 254),
        cleanText(name),
        passwordHash(password),
        Date.now(),
      )
      const token = id() + id()
      db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(
        hash(token),
        uid,
        Date.now() + 7 * 86400000,
      )
      setCookie(res, token)
      res.status(201).json({ user: userOut(db.prepare('SELECT * FROM users WHERE id=?').get(uid)) })
    }),
  )
  app.post(
    '/api/login',
    wrap((req, res) => {
      const email = cleanText(req.body?.email, 254).toLowerCase(),
        pw = req.body?.password
      if (!rate(`login:${req.ip}`, 15, 15 * 60000) || !rate(`account:${email}`, 25, 15 * 60000))
        return res.status(429).json({ error: 'Слишком много попыток. Попробуйте через 15 минут' })
      const user = db.prepare('SELECT * FROM users WHERE email=?').get(email)
      if (
        typeof pw !== 'string' ||
        pw.length > 256 ||
        !passwordMatches(pw, user?.password || passwordHash('invalid-placeholder-password'))
      )
        return res.status(401).json({ error: 'Неверный email или пароль' })
      const token = id() + id()
      db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(
        hash(token),
        user.id,
        Date.now() + 7 * 86400000,
      )
      setCookie(res, token)
      res.json({ user: userOut(user) })
    }),
  )
  app.post('/api/logout', (req, res) => {
    const token = req.headers.cookie
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith('om_session='))
      ?.slice(11)
    if (token) db.prepare('DELETE FROM auth_sessions WHERE token=?').run(hash(token))
    res.clearCookie('om_session', { path: '/' }).json({ ok: true })
  })
  app.use('/api', (req, res, next) =>
    req.user ? next() : res.status(401).json({ error: 'Войдите в аккаунт' }),
  )
  const siteOut = (s) => ({
    ...s,
    domains: JSON.parse(s.domains),
    replay: Boolean(s.replay),
    ...(db.prepare('SELECT primary_goal,timezone FROM site_settings WHERE site_id=?').get(s.id) || {
      primary_goal: '',
      timezone: 'UTC',
    }),
  })
  app.get('/api/sites', (req, res) => {
    let sites = db
      .prepare(
        "SELECT s.*,CASE WHEN s.owner_id=? THEN 'owner' ELSE m.role END role FROM sites s LEFT JOIN members m ON m.site_id=s.id AND m.user_id=? WHERE s.owner_id=? OR m.user_id=? ORDER BY s.created_at",
      )
      .all(req.user.id, req.user.id, req.user.id, req.user.id)
    if (req.apiKey) sites = sites.filter((s) => s.id === req.apiKey.site_id)
    res.json(sites.map(siteOut))
  })
  app.post(
    '/api/sites',
    wrap((req, res) => {
      const name = cleanText(req.body.name)
      if (!name) throw Error('Укажите название сайта')
      const domains = normalizeDomains(req.body.domains)
      const sid = id()
      db.prepare('INSERT INTO sites VALUES(?,?,?,?,?,?)').run(
        sid,
        name,
        JSON.stringify(domains),
        req.user.id,
        req.body.replay ? 1 : 0,
        Date.now(),
      )
      res.status(201).json(siteOut(db.prepare('SELECT * FROM sites WHERE id=?').get(sid)))
    }),
  )
  app.use('/api/sites/:siteId', (req, res, next) => {
    const site = db
      .prepare(
        "SELECT s.*,CASE WHEN s.owner_id=? THEN 'owner' ELSE m.role END role FROM sites s LEFT JOIN members m ON m.site_id=s.id AND m.user_id=? WHERE s.id=? AND (s.owner_id=? OR m.user_id=?)",
      )
      .get(req.user.id, req.user.id, req.params.siteId, req.user.id, req.user.id)
    if (!site || (req.apiKey && req.apiKey.site_id !== site.id))
      return res.status(404).json({ error: 'Счётчик не найден' })
    if (
      !['GET', 'HEAD'].includes(req.method) &&
      site.role === 'viewer' &&
      !req.path.startsWith('/saved')
    )
      return res.status(403).json({ error: 'Только просмотр' })
    req.site = site
    const settings = db
      .prepare('SELECT primary_goal,timezone FROM site_settings WHERE site_id=?')
      .get(site.id)
    req.reportQuery = {
      ...req.query,
      timezone: settings?.timezone || 'UTC',
      goal: req.query.goal || settings?.primary_goal || 'any',
    }
    next()
  })
  const owner = (req, res, next) =>
    req.site.role === 'owner' && !req.apiKey
      ? next()
      : res.status(403).json({ error: 'Нужны права владельца' })
  app.patch(
    '/api/sites/:siteId',
    owner,
    wrap((req, res) => {
      const name = cleanText(req.body.name)
      if (!name) throw Error('Укажите название')
      const previous = db.prepare('SELECT * FROM site_settings WHERE site_id=?').get(req.site.id)
      const timezone = req.body.timezone ?? previous?.timezone ?? 'UTC',
        primary = req.body.primary_goal ?? previous?.primary_goal ?? ''
      try {
        new Intl.DateTimeFormat('en', { timeZone: timezone }).format()
      } catch {
        throw Error('Неизвестный часовой пояс')
      }
      if (
        primary &&
        !db.prepare('SELECT 1 FROM goals WHERE site_id=? AND id=?').get(req.site.id, primary)
      )
        throw Error('Основная цель не найдена')
      db.prepare('UPDATE sites SET name=?,domains=?,replay=? WHERE id=?').run(
        name,
        JSON.stringify(normalizeDomains(req.body.domains)),
        req.body.replay ? 1 : 0,
        req.site.id,
      )
      db.prepare(
        'INSERT INTO site_settings VALUES(?,?,?) ON CONFLICT(site_id) DO UPDATE SET primary_goal=excluded.primary_goal,timezone=excluded.timezone',
      ).run(req.site.id, primary, timezone)
      res.json(siteOut(db.prepare('SELECT * FROM sites WHERE id=?').get(req.site.id)))
    }),
  )
  app.get(
    '/api/sites/:siteId/overview',
    wrap((req, res) => res.json(overview(db, req.site.id, req.reportQuery))),
  )
  app.get(
    '/api/sites/:siteId/insights',
    wrap((req, res) => res.json(insights(db, req.site.id, req.reportQuery))),
  )
  app.get('/api/sites/:siteId/diagnostics', (req, res) => {
    const stats = db
      .prepare('SELECT COUNT(*) visits,MAX(ended) last_seen FROM visits WHERE site_id=?')
      .get(req.site.id)
    const types = db
      .prepare(
        'SELECT type,COUNT(*) events,MAX(ts) last_seen FROM events WHERE site_id=? GROUP BY type',
      )
      .all(req.site.id)
    res.json({
      ...stats,
      events: types,
      recordings: db
        .prepare('SELECT COUNT(DISTINCT visit_id) n FROM replay_chunks WHERE site_id=?')
        .get(req.site.id).n,
      goals: db.prepare('SELECT id,name,kind,value FROM goals WHERE site_id=?').all(req.site.id),
      timezone: req.reportQuery.timezone,
    })
  })
  app.get('/api/sites/:siteId/options', (req, res) =>
    res.json({
      sources: db
        .prepare(
          'SELECT DISTINCT source value FROM visits WHERE site_id=? ORDER BY source LIMIT 500',
        )
        .all(req.site.id)
        .map((r) => r.value),
      campaigns: db
        .prepare(
          "SELECT DISTINCT campaign value FROM visits WHERE site_id=? AND campaign<>'' ORDER BY campaign LIMIT 500",
        )
        .all(req.site.id)
        .map((r) => r.value),
      pages: db
        .prepare(
          "SELECT DISTINCT path value FROM events WHERE site_id=? AND type='pageview' ORDER BY path LIMIT 500",
        )
        .all(req.site.id)
        .map((r) => r.value),
      events: db
        .prepare(
          "SELECT DISTINCT name value FROM events WHERE site_id=? AND type='event' ORDER BY name LIMIT 500",
        )
        .all(req.site.id)
        .map((r) => r.value),
    }),
  )
  app.get(
    '/api/sites/:siteId/business',
    wrap((req, res) => {
      const report = businessReport(db, req.site.id, req.reportQuery)
      if (req.query.format === 'csv')
        return res.type('text/csv').attachment('openmetrika-business.csv').send(csv(report.rows))
      res.json(report)
    }),
  )
  app.post(
    '/api/sites/:siteId/business/import',
    (req, res, next) =>
      req.integrationKey || req.site.role === 'owner'
        ? next()
        : res.status(403).json({ error: 'Импорт продаж доступен владельцу или серверному ключу' }),
    wrap((req, res) => res.json(importBusiness(db, req.site.id, req.body))),
  )
  app.get('/api/sites/:siteId/integrations', owner, (req, res) =>
    res.json(
      db
        .prepare('SELECT id,name,created_at FROM integration_keys WHERE site_id=?')
        .all(req.site.id),
    ),
  )
  app.post('/api/sites/:siteId/integrations', owner, (req, res) => {
    const token = 'om_import_' + id() + id(),
      kid = id()
    db.prepare('INSERT INTO integration_keys VALUES(?,?,?,?,?)').run(
      kid,
      req.site.id,
      hash(token),
      cleanText(req.body.name) || 'CRM import',
      Date.now(),
    )
    res.status(201).json({ id: kid, token })
  })
  app.delete('/api/sites/:siteId/integrations/:id', owner, (req, res) => {
    db.prepare('DELETE FROM integration_keys WHERE site_id=? AND id=?').run(
      req.site.id,
      req.params.id,
    )
    res.json({ ok: true })
  })
  app.get(
    '/api/sites/:siteId/reports/:dimension',
    wrap((req, res) => {
      const rows = breakdown(db, req.site.id, req.reportQuery, req.params.dimension)
      if (req.query.format === 'csv')
        return res.type('text/csv').attachment('openmetrika-report.csv').send(csv(rows))
      res.json(rows)
    }),
  )
  app.get(
    '/api/sites/:siteId/visits',
    wrap((req, res) => res.json(visitsReport(db, req.site.id, req.reportQuery))),
  )
  app.get(
    '/api/sites/:siteId/visits/:visitId',
    wrap((req, res) => {
      const visit = db
        .prepare('SELECT * FROM visits WHERE site_id=? AND id=?')
        .get(req.site.id, req.params.visitId)
      if (!visit) return res.status(404).json({ error: 'Визит не найден' })
      const events = db
        .prepare('SELECT * FROM events WHERE site_id=? AND visit_id=? ORDER BY ts,rowid LIMIT 5000')
        .all(req.site.id, visit.id)
      res.json({ visit, events: events.map((e) => ({ ...e, props: JSON.parse(e.props) })) })
    }),
  )
  app.get(
    '/api/sites/:siteId/visits/:visitId/replay',
    wrap((req, res) => {
      const rows = db
        .prepare(
          'SELECT payload FROM replay_chunks WHERE site_id=? AND visit_id=? ORDER BY ts,rowid',
        )
        .all(req.site.id, req.params.visitId)
      res.json(
        rows
          .flatMap((r) => JSON.parse(gunzipSync(r.payload).toString()))
          .sort((a, b) => a.timestamp - b.timestamp),
      )
    }),
  )
  app.delete('/api/sites/:siteId/visits/:visitId', owner, (req, res) => {
    db.prepare('DELETE FROM visits WHERE site_id=? AND id=?').run(req.site.id, req.params.visitId)
    res.json({ ok: true })
  })
  app.get(
    '/api/sites/:siteId/goals',
    wrap((req, res) => res.json(goalReport(db, req.site.id, req.reportQuery))),
  )
  app.post(
    '/api/sites/:siteId/goals',
    wrap((req, res) => {
      const { name, kind, value } = req.body
      if (!cleanText(name) || !['page', 'event'].includes(kind) || !cleanText(value))
        throw Error('Укажите название, тип и условие цели')
      const gid = id()
      db.prepare('INSERT INTO goals VALUES(?,?,?,?,?)').run(
        gid,
        req.site.id,
        cleanText(name),
        kind,
        kind === 'page' ? cleanPath(value) : cleanText(value, 150),
      )
      res.status(201).json({ id: gid })
    }),
  )
  app.delete('/api/sites/:siteId/goals/:goalId', (req, res) => {
    db.prepare('DELETE FROM goals WHERE site_id=? AND id=?').run(req.site.id, req.params.goalId)
    db.prepare("UPDATE site_settings SET primary_goal='' WHERE site_id=? AND primary_goal=?").run(
      req.site.id,
      req.params.goalId,
    )
    res.json({ ok: true })
  })
  app.get(
    '/api/sites/:siteId/funnels',
    wrap((req, res) =>
      res.json(
        db
          .prepare('SELECT * FROM funnels WHERE site_id=?')
          .all(req.site.id)
          .map((f) => funnelReport(db, req.site.id, req.reportQuery, f)),
      ),
    ),
  )
  app.post(
    '/api/sites/:siteId/funnels',
    wrap((req, res) => {
      const { name, steps } = req.body
      if (
        !cleanText(name) ||
        !Array.isArray(steps) ||
        steps.length < 2 ||
        steps.length > 10 ||
        steps.some((s) => !['page', 'event'].includes(s.kind) || !cleanText(s.value))
      )
        throw Error('Воронка должна содержать 2–10 шагов')
      const fid = id()
      const scope = req.body.scope || 'visit',
        days = req.body.window_days === undefined ? 30 : Number(req.body.window_days)
      if (!['visit', 'visitor'].includes(scope) || ![1, 7, 30, 90].includes(days))
        throw Error('Окно воронки: 1, 7, 30 или 90 дней')
      db.prepare('INSERT INTO funnels VALUES(?,?,?,?)').run(
        fid,
        req.site.id,
        cleanText(name),
        JSON.stringify(
          steps.map((s) => ({
            kind: s.kind,
            value: s.kind === 'page' ? cleanPath(s.value) : cleanText(s.value, 150),
          })),
        ),
      )
      db.prepare('INSERT INTO funnel_settings VALUES(?,?,?)').run(fid, scope, days)
      res.status(201).json({ id: fid })
    }),
  )
  app.patch(
    '/api/sites/:siteId/funnels/:id',
    wrap((req, res) => {
      if (
        !db
          .prepare('SELECT 1 FROM funnels WHERE site_id=? AND id=?')
          .get(req.site.id, req.params.id)
      )
        return res.status(404).json({ error: 'Воронка не найдена' })
      const { name, steps, scope, window_days } = req.body,
        days = window_days === undefined ? 30 : Number(window_days)
      if (
        !cleanText(name) ||
        !Array.isArray(steps) ||
        steps.length < 2 ||
        steps.length > 10 ||
        steps.some((s) => !['page', 'event'].includes(s.kind) || !cleanText(s.value)) ||
        !['visit', 'visitor'].includes(scope) ||
        ![1, 7, 30, 90].includes(days)
      )
        throw Error('Неверная конфигурация воронки')
      db.exec('BEGIN')
      try {
        db.prepare('UPDATE funnels SET name=?,steps=? WHERE site_id=? AND id=?').run(
          cleanText(name),
          JSON.stringify(
            steps.map((s) => ({
              kind: s.kind,
              value: s.kind === 'page' ? cleanPath(s.value) : cleanText(s.value, 150),
            })),
          ),
          req.site.id,
          req.params.id,
        )
        db.prepare(
          'INSERT INTO funnel_settings VALUES(?,?,?) ON CONFLICT(funnel_id) DO UPDATE SET scope=excluded.scope,window_days=excluded.window_days',
        ).run(req.params.id, scope, days)
        db.exec('COMMIT')
      } catch (e) {
        db.exec('ROLLBACK')
        throw e
      }
      res.json({ ok: true })
    }),
  )
  app.delete('/api/sites/:siteId/funnels/:id', (req, res) => {
    db.prepare('DELETE FROM funnels WHERE site_id=? AND id=?').run(req.site.id, req.params.id)
    res.json({ ok: true })
  })
  app.get(
    '/api/sites/:siteId/behavior',
    wrap((req, res) => res.json(behavior(db, req.site.id, req.reportQuery))),
  )
  app.get(
    '/api/sites/:siteId/map-snapshot',
    wrap((req, res) => res.json(mapSnapshot(db, req.site.id, req.reportQuery))),
  )
  app.get(
    '/api/sites/:siteId/ecommerce',
    wrap((req, res) => res.json(commerceReport(db, req.site.id, req.reportQuery))),
  )
  app.get(
    '/api/sites/:siteId/acquisition',
    wrap((req, res) => res.json(acquisitionReport(db, req.site.id, req.reportQuery))),
  )
  app.post(
    '/api/sites/:siteId/costs',
    owner,
    wrap((req, res) => {
      if (!Array.isArray(req.body.rows) || req.body.rows.length > 10000)
        throw Error('Ожидается до 10000 строк расходов')
      const rows = req.body.rows.map((r) => {
        if (
          !validDate(r.day) ||
          !cleanText(r.source) ||
          !Number.isFinite(Number(r.amount)) ||
          Number(r.amount) < 0 ||
          Number(r.amount) > 1e12 ||
          !/^[A-Z]{3}$/.test(r.currency)
        )
          throw Error('Неверный формат расходов')
        return {
          ...r,
          source: cleanText(r.source, 100),
          campaign: cleanText(r.campaign, 150),
          amount: Number(r.amount),
        }
      })
      db.exec('BEGIN')
      try {
        for (const r of rows)
          db.prepare(
            'INSERT INTO ad_costs VALUES(?,?,?,?,?,?) ON CONFLICT(site_id,day,source,campaign,currency) DO UPDATE SET amount=excluded.amount',
          ).run(req.site.id, r.day, r.source, r.campaign, r.currency, r.amount)
        db.exec('COMMIT')
      } catch (e) {
        db.exec('ROLLBACK')
        throw e
      }
      res.json({ imported: rows.length })
    }),
  )
  app.get('/api/sites/:siteId/saved', (req, res) =>
    res.json(
      db
        .prepare('SELECT * FROM saved_reports WHERE site_id=? AND user_id=?')
        .all(req.site.id, req.user.id)
        .map((r) => ({ ...r, config: JSON.parse(r.config) })),
    ),
  )
  app.post(
    '/api/sites/:siteId/saved',
    wrap((req, res) => {
      if (
        !cleanText(req.body.name) ||
        !req.body.config ||
        JSON.stringify(req.body.config).length > 4000
      )
        throw Error('Некорректный отчёт')
      const rid = id()
      db.prepare('INSERT INTO saved_reports VALUES(?,?,?,?,?)').run(
        rid,
        req.site.id,
        req.user.id,
        cleanText(req.body.name),
        JSON.stringify(req.body.config),
      )
      res.status(201).json({ id: rid })
    }),
  )
  app.patch(
    '/api/sites/:siteId/saved/:id',
    wrap((req, res) => {
      if (
        !cleanText(req.body.name) ||
        !req.body.config ||
        JSON.stringify(req.body.config).length > 4000
      )
        throw Error('Некорректный отчёт')
      const result = db
        .prepare('UPDATE saved_reports SET name=?,config=? WHERE site_id=? AND user_id=? AND id=?')
        .run(
          cleanText(req.body.name),
          JSON.stringify(req.body.config),
          req.site.id,
          req.user.id,
          req.params.id,
        )
      if (!result.changes) return res.status(404).json({ error: 'Отчёт не найден' })
      res.json({ ok: true })
    }),
  )
  app.delete('/api/sites/:siteId/business/leads/:leadId', owner, (req, res) => {
    db.prepare('DELETE FROM business_leads WHERE site_id=? AND id=?').run(
      req.site.id,
      req.params.leadId,
    )
    res.json({ ok: true })
  })
  app.delete('/api/sites/:siteId/saved/:id', (req, res) => {
    db.prepare('DELETE FROM saved_reports WHERE site_id=? AND user_id=? AND id=?').run(
      req.site.id,
      req.user.id,
      req.params.id,
    )
    res.json({ ok: true })
  })
  app.get('/api/sites/:siteId/members', owner, (req, res) =>
    res.json(
      db
        .prepare(
          'SELECT u.id,u.name,u.email,m.role FROM members m JOIN users u ON u.id=m.user_id WHERE m.site_id=?',
        )
        .all(req.site.id),
    ),
  )
  app.post(
    '/api/sites/:siteId/members',
    owner,
    wrap((req, res) => {
      const { email, name, password, role } = req.body
      if (!['viewer', 'editor'].includes(role)) throw Error('Неизвестная роль')
      const normalized = cleanText(email, 254).toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw Error('Некорректный email')
      let user = db.prepare('SELECT * FROM users WHERE email=?').get(normalized)
      if (!user) {
        if (typeof password !== 'string' || password.length < 12 || password.length > 256)
          throw Error('Для нового пользователя нужен пароль от 12 символов')
        const uid = id()
        db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(
          uid,
          normalized,
          cleanText(name) || normalized,
          passwordHash(password),
          Date.now(),
        )
        user = { id: uid }
      }
      if (user.id === req.site.owner_id) throw Error('Владелец уже имеет полный доступ')
      db.prepare(
        'INSERT INTO members VALUES(?,?,?) ON CONFLICT(site_id,user_id) DO UPDATE SET role=excluded.role',
      ).run(req.site.id, user.id, role)
      res.status(201).json({ ok: true })
    }),
  )
  app.delete('/api/sites/:siteId/members/:uid', owner, (req, res) => {
    db.prepare('DELETE FROM members WHERE site_id=? AND user_id=?').run(req.site.id, req.params.uid)
    res.json({ ok: true })
  })
  app.get('/api/sites/:siteId/keys', owner, (req, res) =>
    res.json(
      db.prepare('SELECT id,name,created_at FROM api_keys WHERE site_id=?').all(req.site.id),
    ),
  )
  app.post('/api/sites/:siteId/keys', owner, (req, res) => {
    const token = 'om_' + id() + id(),
      kid = id()
    db.prepare('INSERT INTO api_keys VALUES(?,?,?,?,?)').run(
      kid,
      req.site.id,
      hash(token),
      cleanText(req.body.name) || 'Read-only API',
      Date.now(),
    )
    res.status(201).json({ id: kid, token })
  })
  app.delete('/api/sites/:siteId/keys/:id', owner, (req, res) => {
    db.prepare('DELETE FROM api_keys WHERE site_id=? AND id=?').run(req.site.id, req.params.id)
    res.json({ ok: true })
  })
  app.post('/api/sites/:siteId/cleanup', owner, (req, res) => {
    const days = Math.max(1, Math.min(3650, Number(req.body.days) || 180)),
      replayDays = Math.max(1, Math.min(days, Number(req.body.replayDays) || 30))
    const deleted = db
      .prepare('DELETE FROM visits WHERE site_id=? AND started<?')
      .run(req.site.id, Date.now() - days * 86400000).changes
    const recordings = db
      .prepare('DELETE FROM replay_chunks WHERE site_id=? AND ts<?')
      .run(req.site.id, Date.now() - replayDays * 86400000).changes
    res.json({ deleted, recordings })
  })
  if (demo) {
    app.use('/fixture', express.static(resolve(root, 'fixture')))
    app.get('/fixture/{*path}', (req, res) => res.sendFile(resolve(root, 'fixture/index.html')))
  }
  app.use('/api', (req, res) => res.status(404).json({ error: 'Метод API не найден' }))
  if (existsSync(resolve(root, 'dist/index.html'))) {
    app.use(express.static(resolve(root, 'dist')))
    app.get('/{*path}', (req, res) => res.sendFile(resolve(root, 'dist/index.html')))
  }
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err)
    const status = err.status === 413 ? 413 : 400
    res.status(status).json({
      error:
        err.type === 'entity.too.large' ? 'Пакет слишком большой' : err.message || 'Ошибка запроса',
    })
  })
  return { app, db }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { app, db } = createApp({
    demo: process.env.DEMO_MODE === '1',
    readOnly: process.env.DEMO_READ_ONLY === '1',
  })
  const port = Number(process.env.PORT) || 3015,
    host = process.env.HOST || '127.0.0.1'
  const server = app.listen(port, host, () => console.log(`OpenMetrika: http://${host}:${port}`))
  const timer = setInterval(() => {
    db.prepare('DELETE FROM auth_sessions WHERE expires<?').run(Date.now())
    db.prepare('DELETE FROM visits WHERE started<?').run(
      Date.now() - Math.max(1, Number(process.env.RETENTION_DAYS) || 180) * 86400000,
    )
    db.prepare('DELETE FROM replay_chunks WHERE ts<?').run(
      Date.now() - Math.max(1, Number(process.env.REPLAY_RETENTION_DAYS) || 30) * 86400000,
    )
  }, 3600000).unref()
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => {
      clearInterval(timer)
      server.close(() => {
        db.close()
        process.exit(0)
      })
    })
}
