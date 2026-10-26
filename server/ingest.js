import { gzipSync } from 'node:zlib'
import { attribution, technology, cleanPath, cleanText } from './core.js'

const types = new Set([
  'pageview',
  'event',
  'click',
  'scroll',
  'heartbeat',
  'form_start',
  'form_submit',
  'form_field',
  'outbound',
  'download',
  'ecommerce',
  'performance',
  'error',
])
const validId = (v) => typeof v === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(v)
const number = (v, max = 1000000) => Math.min(max, Math.max(0, Number(v) || 0))
function safeProps(type, p = {}) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return {}
  if (type === 'click')
    return {
      x: number(p.x),
      y: number(p.y),
      width: number(p.width, 10000),
      height: number(p.height),
      selector: cleanText(p.selector, 300),
      link: cleanText(p.link) && !/^tel:|^mailto:/i.test(p.link) ? cleanPath(p.link) : '',
      label: cleanText(p.label, 120),
    }
  if (type === 'scroll') return { depth: number(p.depth, 100) }
  if (type === 'heartbeat') return { seconds: number(p.seconds, 30) }
  if (type.startsWith('form_'))
    return { form: cleanText(p.form, 150), field: cleanText(p.field, 100) }
  if (type === 'outbound' || type === 'download') {
    let host = ''
    try {
      host = new URL(p.url).hostname
    } catch {}
    return { host, path: cleanPath(p.url), extension: cleanText(p.extension, 20) }
  }
  if (type === 'performance')
    return Object.fromEntries(
      ['load_ms', 'lcp_ms', 'cls', 'inp_ms']
        .filter((key) => typeof p[key] === 'number' && Number.isFinite(p[key]))
        .map((key) => [key, number(p[key], key === 'cls' ? 100 : 600000)]),
    )
  if (type === 'error') return { message: cleanText(p.message, 200) }
  if (type === 'ecommerce')
    return {
      action: cleanText(p.action, 30),
      order_id: cleanText(p.order_id, 100),
      revenue: number(p.revenue, 1e9),
      currency: /^[A-Z]{3}$/.test(p.currency) ? p.currency : 'RUB',
      items: Array.isArray(p.items)
        ? p.items.slice(0, 100).map((i) => ({
            id: cleanText(i.id, 100),
            name: cleanText(i.name, 150),
            price: number(i.price, 1e8),
            quantity: Math.max(1, number(i.quantity, 10000)),
          }))
        : [],
    }
  // Explicit event parameters are limited scalars. Never accept an arbitrary nested blob.
  return Object.fromEntries(
    Object.entries(p)
      .slice(0, 20)
      .filter(
        ([k, v]) =>
          /^[\w.-]{1,50}$/.test(k) &&
          ['string', 'number', 'boolean'].includes(typeof v) &&
          !/(email|phone|password|token|authorization|cookie)/i.test(k),
      )
      .map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, 200) : v]),
  )
}

export function ingest(db, site, body, ua, now = Date.now()) {
  if (
    !validId(body.visitor) ||
    !validId(body.session) ||
    !Array.isArray(body.events) ||
    body.events.length > 100
  )
    throw Error('Некорректный пакет событий')
  const existing = db
    .prepare('SELECT * FROM visits WHERE site_id=? AND id=?')
    .get(site.id, body.session)
  if (existing && existing.visitor !== body.visitor) throw Error('Конфликт идентификатора визита')
  const meta = body.meta || {},
    attr = attribution(meta),
    tech = technology(ua),
    path = cleanPath(body.events.find((e) => e?.type === 'pageview')?.path || meta.path || '/')
  const events = body.events.map((e) => {
    if (!validId(e.id) || !types.has(e.type)) throw Error('Неизвестное событие')
    const ts = Number(e.ts)
    return {
      ...e,
      ts: Number.isFinite(ts) ? Math.min(now + 60000, Math.max(now - 86400000, ts)) : now,
      path: cleanPath(e.path || path),
      name: cleanText(e.name, 150),
      props: safeProps(e.type, e.props),
    }
  })
  const goals = db.prepare('SELECT * FROM goals WHERE site_id=?').all(site.id)
  let accepted = 0
  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare(
      'INSERT OR IGNORE INTO visits(id,site_id,visitor,started,ended,entry,exit,source,medium,campaign,referrer,device,browser,os,viewport_w,viewport_h) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    ).run(
      body.session,
      site.id,
      body.visitor,
      now,
      now,
      path,
      path,
      attr.source,
      attr.medium,
      attr.campaign,
      attr.referrer,
      tech.device,
      tech.browser,
      tech.os,
      number(meta.width, 10000),
      number(meta.height, 10000),
    )
    for (const e of events) {
      const inserted = db
        .prepare(
          'INSERT OR IGNORE INTO events(id,site_id,visit_id,ts,type,path,name,props) VALUES(?,?,?,?,?,?,?,?)',
        )
        .run(
          e.id,
          site.id,
          body.session,
          e.ts,
          e.type,
          e.path,
          e.name,
          JSON.stringify(e.props),
        ).changes
      if (!inserted) continue
      accepted++
      db.prepare(
        'UPDATE visits SET ended=MAX(ended,?),pageviews=pageviews+?,active_seconds=MIN(86400,active_seconds+?),max_scroll=MAX(max_scroll,?) WHERE site_id=? AND id=?',
      ).run(
        e.ts,
        e.type === 'pageview' ? 1 : 0,
        e.type === 'heartbeat' ? e.props.seconds : 0,
        e.type === 'scroll' ? e.props.depth : 0,
        site.id,
        body.session,
      )
      if (e.type === 'pageview')
        db.prepare('UPDATE visits SET exit=? WHERE site_id=? AND id=? AND ended<=?').run(
          e.path,
          site.id,
          body.session,
          e.ts,
        )
      for (const goal of goals)
        if (
          (goal.kind === 'page' && e.type === 'pageview' && e.path === goal.value) ||
          (goal.kind === 'event' && e.type === 'event' && e.name === goal.value)
        )
          db.prepare(
            'INSERT OR IGNORE INTO conversions(goal_id,site_id,visit_id,event_id,ts) VALUES(?,?,?,?,?)',
          ).run(goal.id, site.id, body.session, e.id, e.ts)
      if (e.type === 'ecommerce' && e.props.action === 'purchase' && e.props.order_id)
        db.prepare(
          'INSERT OR IGNORE INTO orders(site_id,order_id,visit_id,ts,revenue,currency,items) VALUES(?,?,?,?,?,?,?)',
        ).run(
          site.id,
          e.props.order_id,
          body.session,
          e.ts,
          e.props.revenue,
          e.props.currency,
          JSON.stringify(e.props.items),
        )
    }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  return { accepted }
}

export function ingestReplay(db, site, body) {
  if (!site.replay) throw Error('Запись сессий выключена')
  if (
    !validId(body.session) ||
    !validId(body.visitor) ||
    !validId(body.chunk) ||
    !Array.isArray(body.events) ||
    body.events.length > 1000
  )
    throw Error('Некорректная запись')
  const visit = db
    .prepare('SELECT visitor FROM visits WHERE site_id=? AND id=?')
    .get(site.id, body.session)
  if (!visit || visit.visitor !== body.visitor) throw Error('Сначала отправьте события визита')
  const events = body.events.filter(
    (e) =>
      e && Number.isInteger(e.type) && e.type >= 0 && e.type <= 6 && Number.isFinite(e.timestamp),
  )
  if (!events.length) return { accepted: 0 }
  const total = db
    .prepare(
      'SELECT COALESCE(SUM(length(payload)),0) AS size FROM replay_chunks WHERE site_id=? AND visit_id=?',
    )
    .get(site.id, body.session).size
  if (total > 10 * 1024 * 1024) throw Error('Лимит записи визита достигнут')
  const data = gzipSync(JSON.stringify(events))
  db.prepare(
    'INSERT OR IGNORE INTO replay_chunks(site_id,visit_id,chunk_id,ts,payload) VALUES(?,?,?,?,?)',
  ).run(site.id, body.session, body.chunk, Date.now(), data)
  return { accepted: events.length }
}
