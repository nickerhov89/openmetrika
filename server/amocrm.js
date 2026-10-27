import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import { hash, cleanText } from './core.js'
import { importBusiness } from './business.js'

export function amoHost(value) {
  if (typeof value !== 'string') throw Error('Укажите адрес аккаунта amoCRM')
  const host = value
    .trim()
    .replace(/^https:\/\//, '')
    .replace(/\/$/, '')
    .toLowerCase()
  if (!/^[a-z0-9][a-z0-9-]{0,62}\.amocrm\.ru$/.test(host) || host === 'www.amocrm.ru')
    throw Error('Нужен адрес аккаунта вида company.amocrm.ru')
  return host
}

// OAuth secrets never leave the server. Ciphertext is bound to its counter.
export function createAmo(
  db,
  { env = process.env, fetcher = fetch, pause = sleep, now = Date.now } = {},
) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS amo_connections(
      site_id TEXT PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
      host TEXT NOT NULL, tokens TEXT NOT NULL DEFAULT '', config TEXT NOT NULL DEFAULT '{}',
      cursor INTEGER NOT NULL DEFAULT 0, last_sync INTEGER NOT NULL DEFAULT 0,
      error TEXT NOT NULL DEFAULT '', stats TEXT NOT NULL DEFAULT '{}');
    CREATE TABLE IF NOT EXISTS amo_states(
      hash TEXT PRIMARY KEY, site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, host TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS amo_leads(
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE, external_id TEXT NOT NULL,
      updated_at INTEGER NOT NULL, paid REAL NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(site_id,external_id));
  `)
  const key = /^[a-f0-9]{64}$/i.test(env.AMO_TOKEN_ENCRYPTION_KEY || '')
    ? Buffer.from(env.AMO_TOKEN_ENCRYPTION_KEY, 'hex')
    : null
  let redirect = ''
  try {
    const u = new URL(env.AMO_REDIRECT_URI)
    if (
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash &&
      u.pathname === '/api/amocrm/callback'
    )
      redirect = u.href
  } catch {}
  const configured = Boolean(key && env.AMO_CLIENT_ID && env.AMO_CLIENT_SECRET && redirect)
  const locks = new Map()
  const requestSlots = new Map()
  let stopped = false
  const row = (site) => db.prepare('SELECT * FROM amo_connections WHERE site_id=?').get(site)
  const seal = (site, value) => {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', key, iv)
    cipher.setAAD(Buffer.from(site))
    const payload = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()])
    return [iv, cipher.getAuthTag(), payload].map((b) => b.toString('base64')).join('.')
  }
  const unseal = (site, value) => {
    try {
      const [iv, tag, payload] = value.split('.').map((s) => Buffer.from(s, 'base64'))
      const cipher = createDecipheriv('aes-256-gcm', key, iv)
      cipher.setAAD(Buffer.from(site))
      cipher.setAuthTag(tag)
      return JSON.parse(Buffer.concat([cipher.update(payload), cipher.final()]).toString())
    } catch {
      throw Error('Не удалось расшифровать доступ amoCRM. Проверьте ключ шифрования')
    }
  }
  const exclusive = (site, fn) => {
    if (stopped) throw Error('Сервис останавливается')
    if (locks.has(site)) throw Error('Дождитесь завершения операции amoCRM')
    const job = Promise.resolve()
      .then(fn)
      .finally(() => locks.delete(site))
    locks.set(site, job)
    return job
  }
  async function request(host, path, { token, body } = {}) {
    amoHost(host)
    let response
    for (let attempt = 0; attempt < 3; attempt++) {
      const slot = (requestSlots.get(host) || Promise.resolve()).then(() => pause(220))
      requestSlots.set(host, slot)
      await slot
      try {
        response = await fetcher(`https://${host}${path}`, {
          method: body ? 'POST' : 'GET',
          redirect: 'error',
          signal: AbortSignal.timeout(15000),
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        })
      } catch {
        throw Error('amoCRM недоступна: проверьте соединение и повторите синхронизацию')
      }
      if (response.status !== 429 || attempt === 2) break
      const retry = Number(response.headers.get('retry-after'))
      await response.body?.cancel()
      await pause(
        Math.min(
          30000,
          Math.max(1000, Number.isFinite(retry) ? retry * 1000 : 2000 * (attempt + 1)),
        ),
      )
    }
    if (!response.ok) {
      await response.body?.cancel()
      const e = Error(
        response.status === 401
          ? 'Доступ amoCRM истёк. Подключите аккаунт повторно'
          : `amoCRM вернула HTTP ${response.status}. Повторите позже`,
      )
      e.providerStatus = response.status
      throw e
    }
    if (response.status === 204) return { _empty: true }
    // Never include provider response bodies in errors (they can contain personal data).
    const raw = await response.text()
    if (raw.length > 8_000_000) throw Error('Слишком большой ответ amoCRM')
    try {
      return JSON.parse(raw)
    } catch {
      throw Error('Некорректный ответ amoCRM')
    }
  }
  async function exchange(site, host, grant) {
    if (!configured) throw Error('Администратор должен настроить OAuth amoCRM на сервере')
    const result = await request(host, '/oauth2/access_token', {
      body: {
        client_id: env.AMO_CLIENT_ID,
        client_secret: env.AMO_CLIENT_SECRET,
        redirect_uri: redirect,
        ...grant,
      },
    })
    if (
      typeof result.access_token !== 'string' ||
      !result.access_token ||
      typeof result.refresh_token !== 'string' ||
      !result.refresh_token ||
      !Number.isFinite(result.expires_in) ||
      result.expires_in < 60
    )
      throw Error('amoCRM не вернула действительные токены')
    return seal(site, {
      access: result.access_token,
      refresh: result.refresh_token,
      expires: now() + result.expires_in * 1000,
    })
  }
  async function api(site, path, retry = true) {
    const c = row(site)
    if (!configured || !c?.tokens) throw Error('Подключите amoCRM')
    let tokens = unseal(site, c.tokens)
    if (tokens.expires < now() + 60000) {
      const encrypted = await exchange(site, c.host, {
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh,
      })
      db.prepare('UPDATE amo_connections SET tokens=? WHERE site_id=?').run(encrypted, site)
      tokens = unseal(site, encrypted)
    }
    try {
      return await request(c.host, path, { token: tokens.access })
    } catch (e) {
      if (e.providerStatus !== 401 || !retry) throw e
      const encrypted = await exchange(site, c.host, {
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh,
      })
      db.prepare('UPDATE amo_connections SET tokens=? WHERE site_id=?').run(encrypted, site)
      return api(site, path, false)
    }
  }
  async function collection(site, path, name) {
    const result = []
    for (let page = 1; page <= 1000; page++) {
      const data = await api(site, `${path}?limit=50&page=${page}`)
      if (data._empty) return result
      if (!Array.isArray(data._embedded?.[name])) throw Error('Некорректный список amoCRM')
      result.push(...data._embedded[name])
      if (!data._links?.next) return result
    }
    throw Error('Слишком много страниц amoCRM; обратитесь к администратору')
  }
  const status = (site) => {
    const c = row(site)
    return {
      configured,
      redirectUri: redirect,
      connected: Boolean(c?.tokens),
      host: c?.host || '',
      config: c ? JSON.parse(c.config) : {},
      busy: locks.has(site),
      lastSync: c?.last_sync || 0,
      financialLocked: Boolean(
        c?.last_sync || db.prepare('SELECT 1 FROM amo_leads WHERE site_id=? LIMIT 1').get(site),
      ),
      error: c?.error || '',
      stats: c ? JSON.parse(c.stats) : {},
    }
  }
  function begin(site, user, address) {
    if (!configured) throw Error('Настройте OAuth amoCRM на сервере по инструкции docs/AMOCRM.md')
    if (locks.has(site)) throw Error('Дождитесь синхронизации')
    const host = amoHost(address),
      previous = row(site)
    if (previous && previous.host !== host)
      throw Error('Для другого аккаунта amoCRM используйте отдельный счётчик')
    const state = randomBytes(32).toString('hex')
    db.prepare('DELETE FROM amo_states WHERE expires<? OR site_id=?').run(now(), site)
    db.prepare('INSERT INTO amo_states VALUES(?,?,?,?,?)').run(
      hash(state),
      site,
      user,
      host,
      now() + 10 * 60000,
    )
    const url = new URL('https://www.amocrm.ru/oauth')
    url.searchParams.set('client_id', env.AMO_CLIENT_ID)
    url.searchParams.set('state', state)
    url.searchParams.set('mode', 'post_message')
    return { url: url.href }
  }
  async function callback(user, query) {
    if (typeof query.state !== 'string' || !/^[a-f0-9]{64}$/.test(query.state))
      throw Error('Недействительный OAuth state')
    const state = db
      .prepare('SELECT * FROM amo_states WHERE hash=? AND expires>? AND user_id=?')
      .get(hash(query.state), now(), user)
    if (
      !state ||
      !db.prepare('SELECT 1 FROM sites WHERE id=? AND owner_id=?').get(state.site_id, user)
    )
      throw Error('OAuth state истёк или принадлежит другому владельцу')
    if (locks.has(state.site_id))
      throw Error('Дождитесь завершения операции amoCRM и повторите подключение')
    db.prepare('DELETE FROM amo_states WHERE hash=?').run(hash(query.state))
    if (query.error) throw Error('Разрешение amoCRM не выдано. Повторите подключение')
    if (amoHost(query.referer) !== state.host)
      throw Error('Выбран другой аккаунт amoCRM; начните подключение заново')
    if (typeof query.code !== 'string' || !query.code || query.code.length > 4096)
      throw Error('Не получен код OAuth')
    return exclusive(state.site_id, async () => {
      const tokens = await exchange(state.site_id, state.host, {
        grant_type: 'authorization_code',
        code: query.code,
      })
      db.prepare(
        `INSERT INTO amo_connections(site_id,host,tokens) VALUES(?,?,?)
        ON CONFLICT(site_id) DO UPDATE SET host=excluded.host,tokens=excluded.tokens,error=''`,
      ).run(state.site_id, state.host, tokens)
      return state.site_id
    })
  }
  const catalog = (site) =>
    exclusive(site, async () => ({
      pipelines: (await collection(site, '/api/v4/leads/pipelines', 'pipelines')).map((p) => ({
        id: p.id,
        name: cleanText(p.name, 100),
        statuses: (p._embedded?.statuses || []).map((s) => ({
          id: s.id,
          name: cleanText(s.name, 100),
        })),
      })),
      fields: (await collection(site, '/api/v4/leads/custom_fields', 'custom_fields')).map((f) => ({
        id: f.id,
        name: cleanText(f.name, 100),
        type: f.type,
      })),
    }))
  async function configure(site, input) {
    if (locks.has(site)) throw Error('Дождитесь завершения операции amoCRM')
    const c = row(site)
    if (!c?.tokens) throw Error('Сначала подключите аккаунт')
    if (!/^[A-Z]{3}$/.test(input.currency || '')) throw Error('Укажите валюту ISO, например RUB')
    if (
      !Array.isArray(input.pipelines) ||
      !input.pipelines.length ||
      input.pipelines.length > 50 ||
      input.pipelines.some((n) => !Number.isSafeInteger(n) || n < 1)
    )
      throw Error('Выберите воронки')
    if (
      !input.mapping ||
      typeof input.mapping !== 'object' ||
      Array.isArray(input.mapping) ||
      Object.keys(input.mapping).length > 5000
    )
      throw Error('Укажите соответствие статусов')
    for (const [k, value] of Object.entries(input.mapping))
      if (!/^\d+:\d+$/.test(k) || !['qualified', 'meeting', 'won', 'lost'].includes(value))
        throw Error('Неверное соответствие статусов')
    for (const field of ['visitorField', 'paymentField'])
      if (!Number.isSafeInteger(input[field]) || input[field] < 0)
        throw Error('Неверный ID поля amoCRM')
    if (input.paymentField && input.paymentField === input.visitorField)
      throw Error('ClientID и оплаты должны быть разными полями')
    const previous = JSON.parse(c.config)
    if (
      (c.last_sync || db.prepare('SELECT 1 FROM amo_leads WHERE site_id=? LIMIT 1').get(site)) &&
      (previous.currency !== input.currency || previous.paymentField !== input.paymentField)
    )
      throw Error(
        'После первого импорта валюту и поле оплат менять нельзя: это исказит финансовую историю',
      )
    const config = {
      pipelines: [...new Set(input.pipelines)],
      mapping: input.mapping,
      visitorField: input.visitorField,
      paymentField: input.paymentField,
      currency: input.currency,
      automatic: input.automatic === true,
    }
    db.prepare('UPDATE amo_connections SET config=?,cursor=0,error=? WHERE site_id=?').run(
      JSON.stringify(config),
      '',
      site,
    )
    return status(site)
  }
  function importLead(site, c, config, lead) {
    if (
      !Number.isSafeInteger(lead.id) ||
      lead.id < 1 ||
      !Number.isSafeInteger(lead.created_at) ||
      !Number.isSafeInteger(lead.updated_at) ||
      lead.created_at <= 0 ||
      lead.created_at * 1000 > now() ||
      lead.updated_at * 1000 > now() + 60000
    )
      throw Error('amoCRM вернула сделку с неверной датой или ID')
    const external = hash(c.host).slice(0, 12) + ':' + lead.id
    const lid = 'amo:' + external
    const previous = db
      .prepare('SELECT * FROM amo_leads WHERE site_id=? AND external_id=?')
      .get(site, external)
    if (previous && previous.updated_at > lead.updated_at) return { skipped: true }
    const value = (field) =>
      lead.custom_fields_values?.find((f) => f.field_id === field)?.values?.[0]?.value
    const rawVisitor = value(config.visitorField)
    const visitor =
      typeof rawVisitor === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(rawVisitor) ? rawVisitor : ''
    const known = db.prepare('SELECT * FROM business_leads WHERE site_id=? AND id=?').get(site, lid)
    if (visitor && known?.visitor && known.visitor !== visitor)
      throw Error('ClientID сделки изменён: исправьте привязку в amoCRM')
    const rawPaid = value(config.paymentField)
    // Empty after a known payment is not a refund. Explicit zero is required.
    let paid = previous?.paid || 0
    if (config.paymentField && rawPaid !== undefined && rawPaid !== null && rawPaid !== '') {
      if (
        !/^(?:\d+)(?:\.\d{1,2})?$/.test(String(rawPaid)) ||
        !Number.isFinite(Number(rawPaid)) ||
        Number(rawPaid) > 1e12
      )
        throw Error(
          'Поле подтверждённых оплат должно содержать неотрицательную сумму с точностью до копейки',
        )
      paid = Math.round(Number(rawPaid) * 100) / 100
    }
    const event = (suffix, stage, ts, revenue = 0) => ({
      event_id: lid + ':' + suffix,
      lead_id: lid,
      visitor,
      stage,
      ts,
      revenue,
      currency: config.currency,
    })
    const events = []
    if (
      !db
        .prepare('SELECT 1 FROM business_events WHERE site_id=? AND id=?')
        .get(site, lid + ':created')
    )
      events.push(event('created', 'lead', lead.created_at * 1000))
    const stage =
      lead.status_id === 142
        ? 'won'
        : lead.status_id === 143
          ? 'lost'
          : config.mapping[`${lead.pipeline_id}:${lead.status_id}`] || ''
    // Snapshots do not prove that skipped intermediate stages ever happened.
    if (
      stage &&
      !db
        .prepare('SELECT 1 FROM business_events WHERE site_id=? AND id=?')
        .get(site, lid + ':' + stage)
    )
      events.push(event(stage, stage, now()))
    const delta = Math.round((paid - (previous?.paid || 0)) * 100) / 100
    const revision = (previous?.revision || 0) + (delta ? 1 : 0)
    if (delta)
      events.push(
        event('payment:' + revision, delta > 0 ? 'paid' : 'refund', now(), Math.abs(delta)),
      )
    if (events.length) importBusiness(db, site, { events }, { transaction: false })
    if (visitor && known && !known.visitor)
      db.prepare("UPDATE business_leads SET visitor=? WHERE site_id=? AND id=? AND visitor=''").run(
        visitor,
        site,
        lid,
      )
    db.prepare(
      `INSERT INTO amo_leads VALUES(?,?,?,?,?) ON CONFLICT(site_id,external_id)
      DO UPDATE SET updated_at=excluded.updated_at,paid=excluded.paid,revision=excluded.revision`,
    ).run(site, external, lead.updated_at, paid, revision)
    return { matched: Boolean(visitor || known?.visitor), imported: events.length }
  }
  const sync = (site) =>
    exclusive(site, async () => {
      const c = row(site),
        config = c ? JSON.parse(c.config) : {}
      if (!c?.tokens || !config.pipelines?.length)
        throw Error('Подключите аккаунт и сохраните настройки воронок')
      const started = now(),
        stats = { scanned: 0, leads: 0, matched: 0, imported: 0 }
      try {
        for (let page = 1; page <= 1000; page++) {
          const data = await api(
            site,
            `/api/v4/leads?limit=250&page=${page}&order[updated_at]=desc`,
          )
          if (!data._empty && !Array.isArray(data._embedded?.leads))
            throw Error('Некорректный список сделок amoCRM')
          const leads = data._embedded?.leads || []
          let passedCursor = false
          for (const lead of leads) {
            stats.scanned++
            if (c.cursor && lead.updated_at < c.cursor - 120) {
              passedCursor = true
              continue
            }
            if (!config.pipelines.includes(lead.pipeline_id)) continue
            let result
            db.exec('BEGIN IMMEDIATE')
            try {
              result = importLead(site, c, config, lead)
              db.exec('COMMIT')
            } catch (e) {
              db.exec('ROLLBACK')
              throw e
            }
            if (!result.skipped) {
              stats.leads++
              stats.matched += Number(result.matched)
              stats.imported += result.imported
            }
          }
          if (!data._links?.next || passedCursor) {
            db.prepare(
              'UPDATE amo_connections SET cursor=?,last_sync=?,stats=?,error=? WHERE site_id=?',
            ).run(Math.floor(started / 1000), now(), JSON.stringify(stats), '', site)
            return stats
          }
        }
        throw Error('Превышен лимит 250 000 сделок за проход; курсор не изменён')
      } catch (e) {
        db.prepare('UPDATE amo_connections SET error=? WHERE site_id=?').run(
          cleanText(e.message, 250),
          site,
        )
        throw e
      }
    })
  function disconnect(site) {
    if (locks.has(site)) throw Error('Дождитесь завершения операции amoCRM')
    db.prepare('DELETE FROM amo_states WHERE site_id=?').run(site)
    // Retain account/config/cursors to prevent reconnect from changing financial semantics.
    db.prepare("UPDATE amo_connections SET tokens='',error='' WHERE site_id=?").run(site)
    return { ok: true }
  }
  async function tick() {
    if (!configured || stopped) return
    for (const c of db.prepare("SELECT * FROM amo_connections WHERE tokens<>''").all()) {
      if (stopped) break
      if (
        !JSON.parse(c.config).automatic ||
        locks.has(c.site_id) ||
        c.last_sync > now() - 15 * 60000
      )
        continue
      try {
        await sync(c.site_id)
      } catch {
        /* redacted status stored for the owner */
      }
    }
  }
  return {
    status,
    begin,
    callback,
    catalog,
    configure,
    sync,
    disconnect,
    tick,
    async stop() {
      stopped = true
      await Promise.allSettled([...locks.values()])
    },
  }
}
