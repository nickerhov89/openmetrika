export function parseCsv(input) {
  const text = String(input).replace(/^\uFEFF/, '')
  const delimiter = text.split(/\r?\n/, 1)[0].includes(';') ? ';' : ','
  const rows = []
  let row = [],
    cell = '',
    quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"'
        i++
      } else quoted = !quoted
    } else if (c === delimiter && !quoted) {
      row.push(cell)
      cell = ''
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      if (row.some((v) => v.trim())) rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (quoted) throw Error('Незакрытая кавычка в CSV')
  row.push(cell)
  if (row.some((v) => v.trim())) rows.push(row)
  const headers = rows.shift()?.map((s) => s.trim())
  if (
    !headers ||
    !['day', 'source', 'campaign', 'currency', 'amount'].every((k) => headers.includes(k))
  )
    throw Error('Нужны столбцы day,source,campaign,currency,amount')
  return rows.map((r, i) => {
    if (r.length !== headers.length) throw Error(`Неверное число столбцов в строке ${i + 2}`)
    return Object.fromEntries(headers.map((h, j) => [h, r[j].trim()]))
  })
}
