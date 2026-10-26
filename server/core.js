import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'
export const id = () => randomBytes(12).toString('hex')
export const hash = (value) => createHash('sha256').update(value).digest('hex')
export function passwordHash(password) {
  const salt = id()
  return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`
}
export function passwordMatches(password, encoded) {
  const [salt, digest] = encoded.split(':')
  const given = scryptSync(password, salt, 32)
  return timingSafeEqual(given, Buffer.from(digest, 'hex'))
}
export function cleanText(value, max = 200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}
export function cleanPath(value) {
  try {
    return new URL(value, 'https://example.invalid').pathname.slice(0, 1500)
  } catch {
    return '/'
  }
}
export function normalizeDomains(values) {
  if (!Array.isArray(values) || !values.length || values.length > 30)
    throw Error('Укажите от 1 до 30 доменов')
  return [
    ...new Set(
      values.map((v) => {
        const u = new URL(v.includes('://') ? v : `https://${v}`)
        if (
          !['http:', 'https:'].includes(u.protocol) ||
          u.username ||
          u.password ||
          u.hostname.includes('*')
        )
          throw Error('Некорректный домен')
        return u.host.toLowerCase()
      }),
    ),
  ]
}
export function allowedOrigin(site, origin) {
  try {
    return (
      JSON.parse(site.domains).includes(new URL(origin).host.toLowerCase()) &&
      ['http:', 'https:'].includes(new URL(origin).protocol)
    )
  } catch {
    return false
  }
}
export function technology(ua = '') {
  const device = /ipad|tablet/i.test(ua)
    ? 'Планшет'
    : /mobi|iphone|android/i.test(ua)
      ? 'Смартфон'
      : 'Компьютер'
  const browser = /edg\//i.test(ua)
    ? 'Edge'
    : /firefox/i.test(ua)
      ? 'Firefox'
      : /chrome|crios/i.test(ua)
        ? 'Chrome'
        : /safari/i.test(ua)
          ? 'Safari'
          : 'Другой'
  const os = /iphone|ipad/i.test(ua)
    ? 'iOS'
    : /android/i.test(ua)
      ? 'Android'
      : /windows/i.test(ua)
        ? 'Windows'
        : /mac/i.test(ua)
          ? 'macOS'
          : /linux/i.test(ua)
            ? 'Linux'
            : 'Другая'
  return { device, browser, os }
}
export function attribution(meta) {
  const source = cleanText(meta.utm_source, 100),
    medium = cleanText(meta.utm_medium, 100),
    campaign = cleanText(meta.utm_campaign, 150)
  let referrer = ''
  try {
    referrer = new URL(meta.referrer).hostname
  } catch {}
  if (source) return { source, medium: medium || 'utm', campaign, referrer }
  if (!referrer) return { source: 'Прямые заходы', medium: 'direct', campaign: '', referrer: '' }
  if (/(^|\.)(google\.[a-z.]+|yandex\.[a-z]+|bing.com|duckduckgo.com)$/.test(referrer))
    return {
      source: referrer.includes('yandex')
        ? 'Яндекс'
        : referrer.includes('google')
          ? 'Google'
          : referrer,
      medium: 'organic',
      campaign: '',
      referrer,
    }
  return {
    source: referrer,
    medium: /t\.co|t\.me|vk\.com|facebook|instagram|linkedin/.test(referrer)
      ? 'social'
      : 'referral',
    campaign: '',
    referrer,
  }
}
export function validDate(value) {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  )
}
const dateFormatters = new Map()
export function dateKey(ts, timezone = 'UTC') {
  if (!dateFormatters.has(timezone)) {
    if (dateFormatters.size > 100) dateFormatters.clear()
    dateFormatters.set(
      timezone,
      new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }),
    )
  }
  return dateFormatters.get(timezone).format(new Date(ts))
}
export function zonedMidnight(date, timezone = 'UTC') {
  if (!validDate(date)) throw Error('Некорректная календарная дата')
  const target = Date.parse(date + 'T00:00:00Z')
  let value = target
  for (let i = 0; i < 4; i++) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(value)
        .map((p) => [p.type, p.value]),
    )
    const local = Date.parse(
      `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`,
    )
    const correction = target - local
    value += correction
    if (!correction) break
  }
  return value
}
export function period(query) {
  const timezone = query.timezone || 'UTC'
  for (const value of [query.from, query.to])
    if (value && !validDate(value)) throw Error('Некорректная календарная дата')
  const today = dateKey(Date.now(), timezone)
  const nextDay = (d, n) =>
    new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10)
  const endDate = query.to ? zonedMidnight(nextDay(query.to, 1), timezone) - 1 : Date.now()
  const firstDay =
    query.from ||
    nextDay(query.to || today, -(Math.min(366, Math.max(1, Number(query.days) || 30)) - 1))
  const startDate = zonedMidnight(firstDay, timezone)
  if (
    !Number.isFinite(+endDate) ||
    !Number.isFinite(+startDate) ||
    +startDate > +endDate ||
    Date.parse(query.to || today) - Date.parse(firstDay) > 365 * 86400000
  )
    throw Error('Период должен быть от 1 до 366 дней в часовом поясе счётчика')
  return { from: +startDate, to: +endDate }
}
export function visitFilter(siteId, query, range = period(query)) {
  let where = 'v.site_id=? AND v.started>=? AND v.started<=?'
  const params = [siteId, range.from, range.to]
  for (const key of ['source', 'medium', 'campaign', 'device', 'browser', 'os', 'country'])
    if (query[key]) {
      where += ` AND v.${key}=?`
      params.push(cleanText(query[key]))
    }
  if (query.path) {
    const op = ['contains', 'exclude'].includes(query.pathOp) ? query.pathOp : 'exact'
    where += ` AND ${op === 'exclude' ? 'NOT ' : ''}EXISTS(SELECT 1 FROM events pe WHERE pe.site_id=v.site_id AND pe.visit_id=v.id AND pe.type='pageview' AND ${op === 'contains' ? 'instr(pe.path,?)>0' : 'pe.path=?'})`
    params.push(op === 'contains' ? cleanText(query.path, 1500) : cleanPath(query.path))
  }
  if (query.converted === '1') {
    const g = goalFilter(query)
    where += ' AND ' + g.sql
    params.push(...g.params)
  }
  if (query.replay === '1')
    where +=
      ' AND EXISTS(SELECT 1 FROM replay_chunks r WHERE r.site_id=v.site_id AND r.visit_id=v.id)'
  if (query.search) {
    where +=
      ' AND (instr(v.source,?)>0 OR instr(v.entry,?)>0 OR instr(v.visitor,?)>0 OR instr(v.campaign,?)>0)'
    params.push(...Array(4).fill(cleanText(query.search, 200)))
  }
  if (query.conditions) {
    let config
    try {
      config = JSON.parse(query.conditions)
    } catch {
      throw Error('Неверный формат условий сегмента')
    }
    if (
      !['all', 'any'].includes(config.mode) ||
      !Array.isArray(config.rules) ||
      config.rules.length > 20
    )
      throw Error('Не более 20 условий, режим all или any')
    const clauses = []
    for (const rule of config.rules) {
      const allowed = [
        'source',
        'medium',
        'campaign',
        'device',
        'browser',
        'os',
        'country',
        'path',
        'event',
        'event_param',
      ]
      if (
        !allowed.includes(rule.field) ||
        !['equals', 'contains', 'not'].includes(rule.op) ||
        typeof rule.value !== 'string' ||
        !rule.value ||
        rule.value.length > 200
      )
        throw Error('Неверное условие сегмента')
      let column,
        prefix = '',
        suffix = ''
      if (rule.field === 'path' || rule.field === 'event' || rule.field === 'event_param') {
        prefix =
          'EXISTS(SELECT 1 FROM events ae WHERE ae.site_id=v.site_id AND ae.visit_id=v.id AND '
        suffix = ')'
        if (rule.field === 'path') {
          prefix += "ae.type='pageview' AND "
          column = 'ae.path'
        } else if (rule.field === 'event') {
          prefix += "ae.type='event' AND "
          column = 'ae.name'
        } else {
          if (!/^[\w.-]{1,50}$/.test(rule.key || '')) throw Error('Укажите ключ параметра события')
          prefix += "ae.type='event' AND "
          if (rule.event) {
            prefix += 'ae.name=? AND '
            params.push(cleanText(rule.event, 150))
          }
          column = 'CAST(json_extract(ae.props,?) AS TEXT)'
          params.push('$."' + rule.key + '"')
        }
      } else column = 'v.' + rule.field
      const negate = rule.op === 'not'
      const expression = rule.op === 'contains' ? `instr(${column},?)>0` : `${column}=?`
      clauses.push((negate ? 'NOT (' : '') + prefix + expression + suffix + (negate ? ')' : ''))
      params.push(rule.value)
    }
    if (clauses.length)
      where += ' AND (' + clauses.join(config.mode === 'all' ? ' AND ' : ' OR ') + ')'
  }
  return { where, params, range }
}
export function goalFilter(query) {
  const selected = query.goal && query.goal !== 'any'
  return {
    sql: `EXISTS(SELECT 1 FROM conversions c WHERE c.site_id=v.site_id AND c.visit_id=v.id${selected ? ' AND c.goal_id=?' : ''})`,
    params: selected ? [String(query.goal)] : [],
  }
}
export function csv(rows) {
  if (!rows.length) return ''
  const keys = Object.keys(rows[0])
  const quote = (v) =>
    '"' +
    String(typeof v === 'object' ? JSON.stringify(v) : (v ?? ''))
      .replace(/^[\t\r\n ]*([=+@-])/, "'$1")
      .replaceAll('"', '""') +
    '"'
  return (
    '\uFEFF' +
    [
      keys.map(quote).join(','),
      ...rows.map((row) => keys.map((k) => quote(row[k])).join(',')),
    ].join('\r\n')
  )
}
