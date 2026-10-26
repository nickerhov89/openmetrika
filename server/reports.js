import { visitFilter, period, goalFilter, dateKey, cleanPath } from './core.js'
import { gunzipSync } from 'node:zlib'

const round = (n, d = 1) => Number((Number(n) || 0).toFixed(d))
export function mapSnapshot(db, siteId, query) {
  const f = visitFilter(siteId, query)
  const path =
    query.mapPath ||
    (query.pathOp !== 'exclude' && query.pathOp !== 'contains' ? query.path : '') ||
    db
      .prepare(
        `SELECT e.path,COUNT(*) n FROM events e JOIN visits v ON v.site_id=e.site_id AND v.id=e.visit_id WHERE ${f.where} AND e.type='click' GROUP BY e.path ORDER BY n DESC LIMIT 1`,
      )
      .get(...f.params)?.path ||
    '/'
  const visits = db
    .prepare(
      `SELECT v.id FROM visits v WHERE ${f.where} AND EXISTS(SELECT 1 FROM replay_chunks r WHERE r.site_id=v.site_id AND r.visit_id=v.id) ORDER BY started DESC LIMIT 25`,
    )
    .all(...f.params)
  for (const visit of visits) {
    const chunks = db
      .prepare('SELECT payload FROM replay_chunks WHERE site_id=? AND visit_id=? ORDER BY ts,rowid')
      .all(siteId, visit.id)
    let meta = null
    for (const chunk of chunks)
      for (const e of JSON.parse(gunzipSync(chunk.payload).toString())) {
        if (e.type === 4) {
          try {
            meta = new URL(e.data.href).pathname === path ? e : null
          } catch {
            meta = null
          }
        }
        if (e.type === 2 && meta) return { path, visitId: visit.id, events: [meta, e] }
      }
  }
  return { path, events: [], visitId: null }
}
export function overview(db, siteId, query) {
  const f = visitFilter(siteId, query),
    span = f.range.to - f.range.from + 1,
    previous = visitFilter(
      siteId,
      query,
      query.compareFrom && query.compareTo
        ? period({ ...query, from: query.compareFrom, to: query.compareTo })
        : { from: f.range.from - span, to: f.range.from - 1 },
    )
  const goal = goalFilter(query)
  const summary = (filter) => {
    const data = db
      .prepare(
        `SELECT COUNT(*) visits,COUNT(DISTINCT visitor) visitors,COALESCE(SUM(pageviews),0) pageviews,COALESCE(AVG(active_seconds),0) active_seconds,COALESCE(AVG(pageviews),0) depth,COALESCE(SUM(CASE WHEN pageviews<2 AND active_seconds<15 AND NOT EXISTS(SELECT 1 FROM conversions c WHERE c.site_id=v.site_id AND c.visit_id=v.id) THEN 1 ELSE 0 END),0) bounces FROM visits v WHERE ${filter.where}`,
      )
      .get(...filter.params)
    const converted = db
      .prepare(`SELECT COUNT(*) count FROM visits v WHERE ${filter.where} AND ${goal.sql}`)
      .get(...filter.params, ...goal.params).count
    return {
      ...data,
      active_seconds: round(data.active_seconds),
      depth: round(data.depth, 2),
      bounce_rate: round(data.visits ? (data.bounces / data.visits) * 100 : 0),
      conversion_rate: round(data.visits ? (converted / data.visits) * 100 : 0),
      converted,
    }
  }
  const rawTimeline = db
    .prepare(`SELECT started,visitor,pageviews FROM visits v WHERE ${f.where} ORDER BY started`)
    .all(...f.params)
  const grouped = new Map()
  for (const v of rawTimeline) {
    const day = dateKey(v.started, query.timezone),
      row = grouped.get(day) || { day, visits: 0, people: new Set(), pageviews: 0 }
    row.visits++
    row.people.add(v.visitor)
    row.pageviews += v.pageviews
    grouped.set(day, row)
  }
  const timeline = [...grouped.values()].map(({ people, ...r }) => ({
    ...r,
    visitors: people.size,
  }))
  const filled = []
  const byDay = new Map(timeline.map((r) => [r.day, r]))
  for (
    let d = Date.parse(dateKey(f.range.from, query.timezone));
    d <= Date.parse(dateKey(f.range.to, query.timezone));
    d += 86400000
  ) {
    const day = new Date(d).toISOString().slice(0, 10)
    filled.push(byDay.get(day) || { day, visits: 0, visitors: 0, pageviews: 0 })
  }
  const live = db
    .prepare('SELECT COUNT(DISTINCT visitor) count FROM visits WHERE site_id=? AND ended>=?')
    .get(siteId, Date.now() - 5 * 60000).count
  const totals = summary(f)
  const currencies = db
    .prepare(
      `SELECT o.currency,SUM(o.revenue) revenue,COUNT(*) orders FROM orders o JOIN visits v ON v.site_id=o.site_id AND v.id=o.visit_id WHERE ${f.where} GROUP BY currency`,
    )
    .all(...f.params)
  return {
    period: f.range,
    current: totals,
    previous: summary(previous),
    previousPeriod: previous.range,
    goal: query.goal || 'any',
    timeline: filled,
    live,
    currencies,
  }
}

export function insights(db, siteId, query) {
  const current = breakdown(db, siteId, query, 'sources'),
    range = period(query),
    span = range.to - range.from + 1
  const previousRange =
    query.compareFrom && query.compareTo
      ? period({ ...query, from: query.compareFrom, to: query.compareTo })
      : { from: range.from - span, to: range.from - 1 }
  // Compare complete calendar periods explicitly; expose the actual periods to the UI.
  const previous = breakdown(db, siteId, query, 'sources', previousRange)
  const signals = []
  for (const row of current) {
    const old = previous.find((p) => p.source === row.source && p.medium === row.medium)
    if (!old || row.visits < 100 || old.visits < 100 || row.converted + old.converted < 10) continue
    const diff = row.conversion_rate - old.conversion_rate
    if (Math.abs(diff) >= 3 && Math.abs(diff) / (old.conversion_rate || 1) >= 0.25)
      signals.push({
        source: row.source,
        medium: row.medium,
        current: row.conversion_rate,
        previous: old.conversion_rate,
        change_pp: round(diff),
        visits: row.visits,
        previous_visits: old.visits,
        direction: diff < 0 ? 'down' : 'up',
      })
  }
  return {
    signals: signals.sort((a, b) => Math.abs(b.change_pp) - Math.abs(a.change_pp)).slice(0, 5),
    minimum_visits: 100,
    note: 'Эвристические сигналы для проверки, не доказательство причины или статистической значимости. Проверьте качество данных и сезонность.',
    period: range,
    previousPeriod: previousRange,
  }
}

const dimensions = {
  sources: ['source', 'medium'],
  campaigns: ['source', 'medium', 'campaign'],
  devices: ['device'],
  browsers: ['browser'],
  os: ['os'],
  countries: ['country'],
  entry: ['entry'],
  exit: ['exit'],
}
export function breakdown(db, siteId, query, dimension = 'sources', rangeOverride) {
  const f = visitFilter(siteId, query, rangeOverride)
  const goal = goalFilter(query)
  if (dimension === 'retention') {
    const rows = db
      .prepare(
        `WITH first AS (SELECT visitor,MIN(started) first_seen FROM visits WHERE site_id=? GROUP BY visitor) SELECT v.visitor,v.started,first.first_seen FROM visits v JOIN first ON first.visitor=v.visitor WHERE ${f.where} AND first.first_seen>=? AND first.first_seen<=? ORDER BY v.started LIMIT 100000`,
      )
      .all(siteId, ...f.params, f.range.from, f.range.to)
    const monday = (ts) => {
      const d = new Date(ts)
      d.setUTCHours(0, 0, 0, 0)
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
      return +d
    }
    const groups = new Map()
    for (const r of rows) {
      const cohort = monday(r.first_seen),
        offset = Math.floor((monday(r.started) - cohort) / 604800000)
      const group = groups.get(cohort) || {
        users: new Set(),
        weeks: Array.from({ length: 9 }, () => new Set()),
      }
      group.users.add(r.visitor)
      if (offset >= 0 && offset < 9) group.weeks[offset].add(r.visitor)
      groups.set(cohort, group)
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a - b)
      .map(([cohort, g]) => ({
        label: new Date(cohort).toISOString().slice(0, 10),
        users: g.users.size,
        ...Object.fromEntries(
          g.weeks.map((set, i) => [
            'w' + i,
            cohort + i * 604800000 > f.range.to
              ? '—'
              : `${round((set.size / (g.users.size || 1)) * 100)}% (${set.size})`,
          ]),
        ),
      }))
  }
  if (dimension === 'performance')
    return db
      .prepare(
        `SELECT path label,COUNT(*) samples,ROUND(AVG(load_ms),0) load_ms,ROUND(AVG(lcp_ms),0) lcp_ms,ROUND(AVG(cls),3) cls FROM (SELECT e.path,e.visit_id,MAX(json_extract(e.props,'$.load_ms')) load_ms,MAX(json_extract(e.props,'$.lcp_ms')) lcp_ms,MAX(json_extract(e.props,'$.cls')) cls FROM events e JOIN visits v ON v.site_id=e.site_id AND v.id=e.visit_id WHERE ${f.where} AND e.type='performance' GROUP BY e.path,e.visit_id) GROUP BY path ORDER BY samples DESC LIMIT 1000`,
      )
      .all(...f.params)
  if (dimension === 'errors')
    return db
      .prepare(
        `SELECT json_extract(e.props,'$.message') label,e.path,COUNT(*) errors,COUNT(DISTINCT v.id) visits FROM events e JOIN visits v ON v.site_id=e.site_id AND v.id=e.visit_id WHERE ${f.where} AND e.type='error' GROUP BY label,e.path ORDER BY errors DESC LIMIT 1000`,
      )
      .all(...f.params)
  if (dimension === 'pages')
    return db
      .prepare(
        `SELECT e.path label,COUNT(*) pageviews,COUNT(DISTINCT v.id) visits,COUNT(DISTINCT v.visitor) visitors FROM events e JOIN visits v ON v.site_id=e.site_id AND v.id=e.visit_id WHERE ${f.where} AND e.type='pageview' GROUP BY e.path ORDER BY pageviews DESC LIMIT 1000`,
      )
      .all(...f.params)
  if (dimension === 'events')
    return db
      .prepare(
        `SELECT e.name label,COUNT(*) events,COUNT(DISTINCT v.id) visits FROM events e JOIN visits v ON v.site_id=e.site_id AND v.id=e.visit_id WHERE ${f.where} AND e.type='event' GROUP BY e.name ORDER BY events DESC LIMIT 1000`,
      )
      .all(...f.params)
  const cols = dimensions[dimension]
  if (!cols) throw Error('Неизвестный отчёт')
  return db
    .prepare(
      `SELECT ${cols.map((c) => `v.${c}`).join(',')},COUNT(*) visits,COUNT(DISTINCT visitor) visitors,SUM(pageviews) pageviews,ROUND(AVG(active_seconds),1) active_seconds,SUM(CASE WHEN ${goal.sql} THEN 1 ELSE 0 END) converted FROM visits v WHERE ${f.where} GROUP BY ${cols.map((c) => `v.${c}`).join(',')} ORDER BY visits DESC LIMIT 1000`,
    )
    .all(...goal.params, ...f.params)
    .map((row) => ({
      ...row,
      label: cols.map((c) => row[c] || 'Не определено').join(' / '),
      conversion_rate: round(row.visits ? (row.converted / row.visits) * 100 : 0),
    }))
}
export function goalReport(db, siteId, query) {
  const f = visitFilter(siteId, query),
    visits = db.prepare(`SELECT COUNT(*) n FROM visits v WHERE ${f.where}`).get(...f.params).n
  return db
    .prepare('SELECT * FROM goals WHERE site_id=?')
    .all(siteId)
    .map((goal) => {
      const r = db
        .prepare(
          `SELECT COUNT(*) completions,COUNT(DISTINCT c.visit_id) visits FROM conversions c JOIN visits v ON v.site_id=c.site_id AND v.id=c.visit_id WHERE ${f.where} AND c.goal_id=?`,
        )
        .get(...f.params, goal.id)
      return { ...goal, ...r, conversion_rate: round(visits ? (r.visits / visits) * 100 : 0) }
    })
}
export function funnelReport(db, siteId, query, funnel) {
  const f = visitFilter(siteId, query),
    steps = JSON.parse(funnel.steps)
  const settings = db.prepare('SELECT * FROM funnel_settings WHERE funnel_id=?').get(funnel.id) || {
    scope: 'visit',
    window_days: 30,
  }
  const people = settings.scope === 'visitor',
    windowMs = settings.window_days * 86400000
  const eligible = db
    .prepare(`SELECT v.id,v.visitor FROM visits v WHERE ${f.where}`)
    .all(...f.params)
  const ids = new Set(eligible.map((v) => v.id))
  const visitors = new Set(eligible.map((v) => v.visitor))
  const rawRows = people
    ? db
        .prepare(
          "SELECT e.visit_id,v.visitor,e.ts,e.type,e.path,e.name FROM events e JOIN visits v ON v.site_id=e.site_id AND v.id=e.visit_id WHERE e.site_id=? AND e.ts>=? AND e.ts<=? AND e.type IN ('pageview','event') ORDER BY e.ts,e.rowid LIMIT 100001",
        )
        .all(siteId, f.range.from, Math.min(Date.now(), f.range.to + windowMs))
    : db
        .prepare(
          `SELECT e.visit_id,v.visitor,e.ts,e.type,e.path,e.name FROM events e JOIN visits v ON v.site_id=e.site_id AND v.id=e.visit_id WHERE ${f.where} AND e.type IN ('pageview','event') ORDER BY e.ts,e.rowid LIMIT 100001`,
        )
        .all(...f.params)
  const truncated = rawRows.length > 100000
  const rows = (truncated ? rawRows.slice(0, 100000) : rawRows).filter(
    (e) => !people || visitors.has(e.visitor),
  )
  const states = new Map(),
    reached = steps.map(() => new Set()),
    lastVisit = new Map()
  for (const e of rows) {
    const key = people ? e.visitor : e.visit_id
    const starts = states.get(key) || Array(steps.length).fill(null)
    // Reverse traversal prevents one event from satisfying two identical steps.
    // The latest valid start at each stage preserves overlapping attempts.
    for (let i = steps.length - 1; i >= 0; i--) {
      const step = steps[i]
      if (!(
        (step.kind === 'page' && e.type === 'pageview' && e.path === step.value) ||
        (step.kind === 'event' && e.type === 'event' && e.name === step.value)
      ))
        continue
      const start = i ? starts[i - 1] : e.ts
      if (
        (i === 0 && (!ids.has(e.visit_id) || e.ts > f.range.to)) ||
        start === null ||
        (people && e.ts - start > windowMs)
      )
        continue
      starts[i] = Math.max(starts[i] ?? 0, start)
      reached[i].add(key)
      lastVisit.set(key, e.visit_id)
    }
    states.set(key, starts)
  }
  return {
    ...funnel,
    truncated,
    ...settings,
    scope: settings.scope,
    window_days: settings.window_days,
    steps: steps.map((s, i) => ({
      ...s,
      count: reached[i].size,
      conversion: i
        ? round(reached[i - 1].size ? (reached[i].size / reached[i - 1].size) * 100 : 0)
        : 100,
      from_start: round(reached[0].size ? (reached[i].size / reached[0].size) * 100 : 0),
      dropoff: i < steps.length - 1 ? reached[i].size - reached[i + 1].size : 0,
      dropoff_visits:
        i < steps.length - 1
          ? [...reached[i]]
              .filter((k) => !reached[i + 1].has(k))
              .slice(0, 25)
              .map((k) => lastVisit.get(k))
          : [],
    })),
  }
}
export function behavior(db, siteId, query) {
  const f = visitFilter(siteId, query),
    page =
      query.mapPath ||
      (query.path && !['contains', 'exclude'].includes(query.pathOp) ? cleanPath(query.path) : ''),
    rows = db
      .prepare(
        `SELECT e.type,e.path,e.props,e.visit_id FROM events e JOIN visits v ON v.site_id=e.site_id AND v.id=e.visit_id WHERE ${f.where}${page ? ' AND e.path=?' : ''} AND e.type IN ('click','scroll','form_start','form_submit','form_field') ORDER BY e.ts,e.rowid LIMIT 50000`,
      )
      .all(...f.params, ...(page ? [cleanPath(page)] : []))
  const clicks = [],
    scrolls = new Map(),
    forms = new Map(),
    links = new Map()
  for (const row of rows) {
    const p = JSON.parse(row.props)
    if (row.type === 'click') {
      clicks.push({ ...p, path: row.path })
      if (p.link) {
        const key = row.path + ' → ' + p.link
        links.set(key, (links.get(key) || 0) + 1)
      }
    }
    if (row.type === 'scroll') {
      const key = row.visit_id
      scrolls.set(key, Math.max(scrolls.get(key) || 0, p.depth))
    }
    if (row.type.startsWith('form_')) {
      const key = row.path + '|' + p.form
      const entry = forms.get(key) || {
        path: row.path,
        form: p.form,
        starts: new Set(),
        submits: new Set(),
        fields: {},
      }
      if (row.type === 'form_start') entry.starts.add(row.visit_id)
      if (row.type === 'form_submit') entry.submits.add(row.visit_id)
      if (row.type === 'form_field') entry.fields[p.field] = (entry.fields[p.field] || 0) + 1
      forms.set(key, entry)
    }
  }
  const depths = [...scrolls.values()]
  return {
    clicks,
    links: [...links]
      .map(([label, clicks]) => ({ label, clicks }))
      .sort((a, b) => b.clicks - a.clicks),
    scroll: [0, 25, 50, 75, 90, 100].map((depth) => ({
      depth,
      visits: depths.filter((d) => d >= depth).length,
      percent: round(
        depths.length ? (depths.filter((d) => d >= depth).length / depths.length) * 100 : 0,
      ),
    })),
    forms: [...forms.values()].map((f) => ({
      ...f,
      starts: f.starts.size,
      submits: f.submits.size,
      completed: [...f.submits].filter((id) => f.starts.has(id)).length,
      untracked_starts: [...f.submits].filter((id) => !f.starts.has(id)).length,
      conversion: round(
        f.starts.size
          ? ([...f.submits].filter((id) => f.starts.has(id)).length / f.starts.size) * 100
          : 0,
      ),
    })),
    truncated: rows.length === 50000,
  }
}
export function visitsReport(db, siteId, query) {
  const f = visitFilter(siteId, query)
  return db
    .prepare(
      `SELECT v.*,EXISTS(SELECT 1 FROM replay_chunks r WHERE r.site_id=v.site_id AND r.visit_id=v.id) has_replay,(SELECT COUNT(*) FROM conversions c WHERE c.site_id=v.site_id AND c.visit_id=v.id) goals FROM visits v WHERE ${f.where} ORDER BY started DESC LIMIT 250`,
    )
    .all(...f.params)
}

function orderFilter(siteId, query) {
  if (query.dateBasis === 'visit') return visitFilter(siteId, query)
  const range = period(query),
    f = visitFilter(siteId, query, { from: 0, to: Number.MAX_SAFE_INTEGER })
  f.where += ' AND o.ts>=? AND o.ts<=?'
  f.params.push(range.from, range.to)
  return f
}
export function commerceReport(db, siteId, query) {
  const f = orderFilter(siteId, query),
    join = `FROM orders o JOIN visits v ON v.site_id=o.site_id AND v.id=o.visit_id WHERE ${f.where}`
  const totals = db
    .prepare(`SELECT currency,COUNT(*) orders,SUM(revenue) revenue ${join} GROUP BY currency`)
    .all(...f.params)
  const orders = db
    .prepare(`SELECT o.* ${join} ORDER BY o.ts DESC LIMIT 5000`)
    .all(...f.params)
    .map((o) => ({ ...o, items: JSON.parse(o.items) }))
  const products = db
    .prepare(
      `SELECT json_extract(i.value,'$.id') id,json_extract(i.value,'$.name') name,o.currency,SUM(json_extract(i.value,'$.quantity')) quantity,SUM(json_extract(i.value,'$.quantity')*json_extract(i.value,'$.price')) revenue FROM orders o JOIN visits v ON v.site_id=o.site_id AND v.id=o.visit_id JOIN json_each(o.items) i WHERE ${f.where} GROUP BY json_extract(i.value,'$.id'),json_extract(i.value,'$.name'),o.currency ORDER BY revenue DESC LIMIT 1000`,
    )
    .all(...f.params)
  return { totals, orders, products }
}
export function acquisitionReport(db, siteId, query) {
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
      'conditions',
    ].some((k) => query[k])
  )
    throw Error(
      'Расходы доступны по периоду, источнику и кампании. Сбросьте остальные условия сегмента.',
    )
  const f = visitFilter(siteId, query),
    ordersFilter = orderFilter(siteId, query),
    range = period(query)
  const costs = db
    .prepare(
      'SELECT source,campaign,currency,SUM(amount) cost FROM ad_costs WHERE site_id=? AND day>=? AND day<=? GROUP BY source,campaign,currency',
    )
    .all(siteId, dateKey(range.from, query.timezone), dateKey(range.to, query.timezone))
  const revenues = db
    .prepare(
      `SELECT v.source,v.campaign,o.currency,SUM(o.revenue) revenue,COUNT(*) orders FROM orders o JOIN visits v ON v.site_id=o.site_id AND v.id=o.visit_id WHERE ${ordersFilter.where} GROUP BY v.source,v.campaign,o.currency`,
    )
    .all(...ordersFilter.params)
  const traffic = db
    .prepare(
      `SELECT source,campaign,COUNT(*) visits FROM visits v WHERE ${f.where} GROUP BY source,campaign`,
    )
    .all(...f.params)
  const rows = new Map()
  for (const r of [...costs, ...revenues]) {
    if (
      (query.source && r.source !== query.source) ||
      (query.campaign && r.campaign !== query.campaign)
    )
      continue
    const key = JSON.stringify([r.source, r.campaign, r.currency])
    rows.set(key, {
      source: r.source,
      campaign: r.campaign,
      currency: r.currency,
      cost: 0,
      has_cost: false,
      revenue: 0,
      orders: 0,
      ...rows.get(key),
      ...r,
      ...(Object.hasOwn(r, 'cost') ? { has_cost: true } : {}),
    })
  }
  return [...rows.values()].map((r) => ({
    ...r,
    visits: traffic.find((t) => t.source === r.source && t.campaign === r.campaign)?.visits || 0,
    roas: r.cost ? round(r.revenue / r.cost, 2) : null,
    cpa: r.has_cost && r.orders ? round(r.cost / r.orders, 2) : null,
  }))
}
