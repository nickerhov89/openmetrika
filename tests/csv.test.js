import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCsv } from '../server/csv.js'
test('ad cost CSV supports quoting, BOM, semicolons and multiline campaign names', () => {
  assert.deepEqual(
    parseCsv(
      '\uFEFFday;source;campaign;currency;amount\r\n2026-10-01;yandex;"brand; one";RUB;100\r\n',
    ),
    [
      {
        day: '2026-10-01',
        source: 'yandex',
        campaign: 'brand; one',
        currency: 'RUB',
        amount: '100',
      },
    ],
  )
  assert.equal(
    parseCsv('day,source,campaign,currency,amount\n2026-10-01,yandex,"hello\nworld",RUB,5')[0]
      .campaign,
    'hello\nworld',
  )
  assert.throws(() => parseCsv('bad,data\n1,2'), /столбцы/)
})
