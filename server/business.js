import { cleanText, dateKey, period } from './core.js'

export const stages = ['lead', 'qualified', 'meeting', 'won', 'paid', 'refund', 'lost']
const externalId = (v) => typeof v === 'string' && /^[\w.:-]{1,100}$/.test(v)

// Only authenticated server imports can change sales outcomes. Browser events cannot.
export function importBusiness(db, siteId, body) {
  if (!Array.isArray(body.events) || !body.events.length || body.events.length > 1000)
    throw Error('Передайте от 1 до 1000 событий продаж')
  const events = body.events.map((e) => {
    const ts = typeof e.ts === 'number' ? e.ts : Date.parse(e.ts)
    for (const key of ['visitor', 'session'])
      if (e[key] && !/^[a-zA-Z0-9_-]{8,100}$/.test(e[key]))
        throw Error('Идентификаторы посетителя и визита должны совпадать с ID счётчика')
    if (
      !externalId(e.event_id) ||
      !externalId(e.lead_id) ||
      !stages.includes(e.stage) ||
      !Number.isFinite(ts) ||
      ts < 0 ||
      ts > Date.now() + 60000 ||
      !/^[A-Z]{3}$/.test(e.currency || 'RUB')
    )
      throw Error('Неверный ID, этап, дата или валюта события')
    for (const k of ['revenue', 'cost'])
      if (e[k] !== undefined && (!Number.isFinite(e[k]) || e[k] < 0 || e[k] > 1e12))
        throw Error('Суммы должны быть неотрицательными числами')
    return {
      id: e.event_id,
      lead: e.lead_id,
      stage: e.stage,
      ts,
      visitor: cleanText(e.visitor, 100),
      session: cleanText(e.session, 100),
      currency: e.currency || 'RUB',
      revenue: e.revenue || 0,
      cost: e.cost || 0,
    }
  })
  let imported = 0,
    duplicates = 0
  db.exec('BEGIN IMMEDIATE')
  try {
    for (const e of events) {
      const previous = db
        .prepare('SELECT * FROM business_events WHERE site_id=? AND id=?')
        .get(siteId, e.id)
      if (previous) {
        if (
          previous.lead_id !== e.lead ||
          previous.stage !== e.stage ||
          previous.ts !== e.ts ||
          previous.currency !== e.currency ||
          previous.revenue !== e.revenue ||
          previous.cost !== e.cost
        )
          throw Error('ID события уже существует с другим содержимым')
        duplicates++
        continue
      }
      if (e.session) {
        const visit = db
          .prepare('SELECT visitor FROM visits WHERE site_id=? AND id=?')
          .get(siteId, e.session)
        if (!visit || (e.visitor && e.visitor !== visit.visitor))
          throw Error('Визит не найден в этом счётчике или не совпадает посетитель')
        e.visitor = visit.visitor
      }
      const lead = db
        .prepare('SELECT * FROM business_leads WHERE site_id=? AND id=?')
        .get(siteId, e.lead)
      if (
        lead &&
        ((e.visitor && lead.visitor && e.visitor !== lead.visitor) ||
          (e.session && lead.visit_id && e.session !== lead.visit_id))
      )
        throw Error('Нельзя перепривязать существующий лид')
      const currency = db
        .prepare('SELECT currency FROM business_events WHERE site_id=? AND lead_id=? LIMIT 1')
        .get(siteId, e.lead)?.currency
      if (currency && currency !== e.currency)
        throw Error('Все события одного лида должны иметь одну валюту')
      db.prepare(
        "INSERT INTO business_leads VALUES(?,?,?,?,?) ON CONFLICT(site_id,id) DO UPDATE SET created_at=MIN(created_at,excluded.created_at),visitor=CASE WHEN visitor='' THEN excluded.visitor ELSE visitor END,visit_id=CASE WHEN visit_id='' THEN excluded.visit_id ELSE visit_id END",
      ).run(siteId, e.lead, e.visitor, e.session, e.ts)
      db.prepare('INSERT INTO business_events VALUES(?,?,?,?,?,?,?,?)').run(
        siteId,
        e.lead,
        e.id,
        e.stage,
        e.ts,
        e.revenue,
        e.cost,
        e.currency,
      )
      imported++
    }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  return { imported, duplicates }
}

export function businessReport(db, siteId, query) {
  if (
    [
      'device',
      'browser',
      'os',
      'country',
      'path',
      'converted',
      'replay',
      'medium',
      'search',
      'conditions',
    ].some((k) => query[k])
  )
    throw Error(
      'Экономика продаж поддерживает период, источник и кампанию. Сбросьте остальные условия сегмента.',
    )
  const range = period(query),
    windowDays = [7, 30, 90].includes(Number(query.attributionDays))
      ? Number(query.attributionDays)
      : 90
  const model = query.attribution === 'last' ? 'last' : 'first'
  const financial = query.businessBasis === 'event'
  const leads = db
    .prepare(
      `SELECT * FROM business_leads WHERE site_id=?${financial ? '' : ' AND created_at>=? AND created_at<=?'} ORDER BY created_at`,
    )
    .all(siteId, ...(financial ? [] : [range.from, range.to]))
  const allEvents = db
    .prepare('SELECT * FROM business_events WHERE site_id=? AND ts<=? ORDER BY ts,id')
    .all(siteId, Date.now())
  const byLead = new Map()
  for (const e of allEvents) {
    const arr = byLead.get(e.lead_id) || []
    arr.push(e)
    byLead.set(e.lead_id, arr)
  }
  const rows = new Map(),
    details = []
  const visits = db.prepare(
    'SELECT * FROM visits WHERE site_id=? AND visitor=? AND started>=? AND started<=? ORDER BY started,id',
  )
  const precise = db.prepare('SELECT * FROM visits WHERE site_id=? AND id=?')
  for (const lead of leads) {
    const history = byLead.get(lead.id) || []
    const events = financial
      ? history.filter((e) => e.ts >= range.from && e.ts <= range.to)
      : history
    if (!events.length) continue
    const touches = lead.visitor
      ? visits.all(
          siteId,
          lead.visitor,
          Math.max(0, lead.created_at - windowDays * 86400000),
          lead.created_at,
        )
      : []
    const direct = lead.visit_id ? precise.get(siteId, lead.visit_id) : null
    const nonDirect = touches.filter((v) => v.medium !== 'direct')
    const chosen =
      model === 'last' ? nonDirect.at(-1) || touches.at(-1) || direct : touches[0] || direct
    const source = chosen?.source || 'Не атрибутировано',
      campaign = chosen?.campaign || ''
    if (
      (query.source && source !== query.source) ||
      (query.campaign && campaign !== query.campaign)
    )
      continue
    const currency = events[0].currency,
      key = JSON.stringify([source, campaign, currency])
    const row = rows.get(key) || {
      source,
      campaign,
      currency,
      leads: 0,
      qualified: 0,
      meetings: 0,
      won: 0,
      customers: 0,
      revenue: 0,
      direct_cost: 0,
      refunds: 0,
      cost: null,
    }
    row.leads++
    for (const [stage, field] of [
      ['qualified', 'qualified'],
      ['meeting', 'meetings'],
      ['won', 'won'],
      ['paid', 'customers'],
    ])
      if (events.some((e) => e.stage === stage)) row[field]++
    for (const e of events) {
      if (e.stage === 'paid') row.revenue += e.revenue
      if (e.stage === 'refund') {
        row.revenue -= e.revenue
        row.refunds += e.revenue
      }
      row.direct_cost += e.cost
    }
    rows.set(key, row)
    details.push({
      id: lead.id,
      created_at: lead.created_at,
      source,
      campaign,
      currency,
      stage: history.at(-1)?.stage || 'lead',
      visit_id: chosen?.id || null,
      events: events.map(({ stage, ts, revenue, cost, currency }) => ({
        stage,
        ts,
        revenue,
        cost,
        currency,
      })),
    })
  }
  const costs = db
    .prepare(
      'SELECT source,campaign,currency,SUM(amount) cost FROM ad_costs WHERE site_id=? AND day>=? AND day<=? GROUP BY source,campaign,currency',
    )
    .all(siteId, dateKey(range.from, query.timezone), dateKey(range.to, query.timezone))
  for (const c of costs) {
    if (
      (query.source && c.source !== query.source) ||
      (query.campaign && c.campaign !== query.campaign)
    )
      continue
    const key = JSON.stringify([c.source, c.campaign, c.currency])
    const row = rows.get(key) || {
      ...c,
      leads: 0,
      qualified: 0,
      meetings: 0,
      won: 0,
      customers: 0,
      revenue: 0,
      direct_cost: 0,
      refunds: 0,
    }
    row.cost = c.cost
    rows.set(key, row)
  }
  const result = [...rows.values()].map((r) => ({
    ...r,
    gross_profit: r.revenue - r.direct_cost,
    contribution: r.cost === null ? null : r.revenue - r.direct_cost - r.cost,
    cpl: r.cost === null || !r.leads ? null : r.cost / r.leads,
    cpql: r.cost === null || !r.qualified ? null : r.cost / r.qualified,
    cpm: r.cost === null || !r.meetings ? null : r.cost / r.meetings,
    cac: r.cost === null || !r.customers ? null : r.cost / r.customers,
    roas: r.cost ? r.revenue / r.cost : null,
    romi: r.cost ? ((r.revenue - r.direct_cost - r.cost) / r.cost) * 100 : null,
  }))
  const groups = new Map()
  for (const lead of details) {
    const d = new Date(dateKey(lead.created_at, query.timezone) + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
    const week = d.toISOString().slice(0, 10),
      key = week + '|' + lead.currency,
      g = groups.get(key) || {
        week,
        currency: lead.currency,
        leads: 0,
        qualified: 0,
        customers: 0,
        revenue: 0,
        paymentDays: [],
      }
    g.leads++
    if (lead.events.some((e) => e.stage === 'qualified')) g.qualified++
    const paid = lead.events.find((e) => e.stage === 'paid')
    if (paid) {
      g.customers++
      g.paymentDays.push((paid.ts - lead.created_at) / 86400000)
    }
    g.revenue += lead.events.reduce(
      (sum, e) => sum + (e.stage === 'paid' ? e.revenue : e.stage === 'refund' ? -e.revenue : 0),
      0,
    )
    groups.set(key, g)
  }
  const cohorts = [...groups.values()]
    .map(({ paymentDays, ...g }) => ({
      ...g,
      payment_days: paymentDays.length
        ? paymentDays.reduce((a, b) => a + b, 0) / paymentDays.length
        : null,
    }))
    .sort((a, b) => b.week.localeCompare(a.week))
  return {
    rows: result,
    leads: details.slice(-250).reverse(),
    cohorts,
    totalLeads: details.length,
    period: range,
    attribution: model,
    attributionDays: windowDays,
    basis: financial ? 'event' : 'cohort',
    warnings: [
      'Этапы считаются по переданной истории; пропущенные этапы не восстанавливаются автоматически.',
      'Стоимость клиента здесь — на оплативший лид, без объединения нескольких лидов одного клиента.',
      'Маржа достоверна только при полной передаче прямых затрат; расходы рекламы берутся за выбранный период.',
      'Когорты разного возраста имеют разное время на конверсию. Среднее до оплаты рассчитано только по оплатившим.',
    ],
  }
}
