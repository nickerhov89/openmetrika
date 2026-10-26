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
export function period(query) {
  const endDate = query.to ? new Date(`${query.to}T23:59:59.999Z`) : new Date()
  const startDate = query.from
    ? new Date(`${query.from}T00:00:00.000Z`)
    : new Date(
        Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()) -
          (Math.min(366, Math.max(1, Number(query.days) || 30)) - 1) * 86400000,
      )
  if (
    !Number.isFinite(+endDate) ||
    !Number.isFinite(+startDate) ||
    +startDate > +endDate ||
    +endDate - +startDate > 366 * 86400000
  )
    throw Error('Период должен быть от 1 до 366 дней, даты в UTC')
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
    where +=
      " AND EXISTS(SELECT 1 FROM events pe WHERE pe.site_id=v.site_id AND pe.visit_id=v.id AND pe.type='pageview' AND pe.path=?)"
    params.push(cleanPath(query.path))
  }
  if (query.converted === '1')
    where +=
      ' AND EXISTS(SELECT 1 FROM conversions c WHERE c.site_id=v.site_id AND c.visit_id=v.id)'
  if (query.replay === '1')
    where +=
      ' AND EXISTS(SELECT 1 FROM replay_chunks r WHERE r.site_id=v.site_id AND r.visit_id=v.id)'
  return { where, params, range }
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
