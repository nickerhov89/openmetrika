import { gzipSync } from 'node:zlib'
import { id, passwordHash } from '../server/core.js'
import { ingest } from '../server/ingest.js'

export const DEMO_SITE = 'demo_openmetrika'
export function seedDemo(db, now = Date.now()) {
  if (db.prepare('SELECT 1 FROM sites WHERE id=?').get(DEMO_SITE)) return
  const owner = 'demo_owner_user'
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(
    owner,
    'demo@example.invalid',
    'Алексей · демо',
    passwordHash(id() + id()),
    now,
  )
  const domains = [
    'localhost:3015',
    '127.0.0.1:3015',
    'localhost:5180',
    '127.0.0.1:5180',
    '127.0.0.1:3016',
  ]
  db.prepare('INSERT INTO sites VALUES(?,?,?,?,?,?)').run(
    DEMO_SITE,
    'Northline Studio',
    JSON.stringify(domains),
    owner,
    1,
    now,
  )
  db.prepare('INSERT INTO goals VALUES(?,?,?,?,?)').run(
    'demo_goal_lead',
    DEMO_SITE,
    'Заявка на проект',
    'event',
    'lead_sent',
  )
  db.prepare('INSERT INTO goals VALUES(?,?,?,?,?)').run(
    'demo_goal_pricing',
    DEMO_SITE,
    'Просмотр тарифов',
    'page',
    '/pricing',
  )
  db.prepare('INSERT INTO goals VALUES(?,?,?,?,?)').run(
    'demo_goal_form',
    DEMO_SITE,
    'Отправка формы',
    'event',
    'form_submit',
  )
  db.prepare('INSERT INTO funnels VALUES(?,?,?,?)').run(
    'demo_funnel_main',
    DEMO_SITE,
    'От знакомства до заявки',
    JSON.stringify([
      { kind: 'page', value: '/' },
      { kind: 'page', value: '/pricing' },
      { kind: 'event', value: 'lead_sent' },
    ]),
  )
  let state = 7341
  const rand = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0
    return state / 4294967296
  }
  const midnight = Date.parse(new Date(now).toISOString().slice(0, 10)),
    sources = [
      ['Google', 'organic', ''],
      ['Яндекс', 'organic', ''],
      ['Прямые заходы', 'direct', ''],
      ['telegram', 'social', 'launch'],
      ['newsletter', 'email', 'october'],
      ['yandex', 'cpc', 'brand'],
    ]
  let count = 0
  for (let day = 29; day >= 0; day--) {
    const n = day === 0 ? 18 : 65 + Math.floor(rand() * 75) + (29 - day) * 2
    for (let i = 0; i < n; i++) {
      const start = Math.min(
          now - 30000,
          midnight - day * 86400000 + Math.floor(rand() * 80000000),
        ),
        sid = `demo_visit_${++count}`,
        visitor = `demo_person_${Math.floor(rand() * 2600)}`,
        src = sources[Math.floor(rand() * sources.length)],
        mobile = rand() < 0.43
      const events = [],
        event = (type, path = '/', name = '', props = {}) =>
          events.push({
            id: `demo_event_${count}_${events.length}`,
            type,
            path,
            name,
            props,
            ts: start + events.length * 2800,
          })
      event('pageview')
      event('scroll', '/', '', { depth: Math.floor(rand() * 11) * 10 })
      if (rand() > 0.24) {
        event('heartbeat', '/', '', { seconds: 10 })
        event('pageview', rand() > 0.4 ? '/solutions' : '/about')
        event('click', '/', '', {
          x: 250 + rand() * 200,
          y: 350 + rand() * 100,
          width: 1280,
          height: 1800,
          selector: 'a.primary',
          link: '/pricing',
          label: 'Обсудить проект',
        })
        event('heartbeat', '/', '', { seconds: 15 })
      }
      const lead = rand() < 0.065
      if (lead || rand() < 0.22) {
        event('pageview', '/pricing')
        event('scroll', '/pricing', '', { depth: Math.floor(rand() * 4 + 7) * 10 })
        event('form_start', '/pricing', '', { form: 'project-request' })
        event('form_field', '/pricing', '', { form: 'project-request', field: 'company' })
      }
      if (lead) {
        event('form_submit', '/pricing', '', { form: 'project-request' })
        event('event', '/pricing', 'form_submit')
        event('event', '/pricing', 'lead_sent')
        event('pageview', '/thank-you')
        if (rand() < 0.4)
          event('ecommerce', '/thank-you', '', {
            action: 'purchase',
            order_id: `DEMO-${count}`,
            revenue: [25000, 50000, 75000][Math.floor(rand() * 3)],
            currency: 'RUB',
            items: [{ id: 'audit', name: 'Аудит сайта', price: 25000, quantity: 1 }],
          })
      }
      const meta = {
        path: '/',
        width: mobile ? 390 : 1280,
        height: mobile ? 844 : 800,
        utm_source: src[0],
        utm_medium: src[1],
        utm_campaign: src[2],
      }
      const site = db.prepare('SELECT * FROM sites WHERE id=?').get(DEMO_SITE)
      ingest(
        db,
        site,
        { session: sid, visitor, meta, events },
        mobile
          ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1 Safari/604.1'
          : 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
        start,
      )
      db.prepare('UPDATE visits SET started=?,ended=? WHERE site_id=? AND id=?').run(
        start,
        start + events.length * 2800,
        DEMO_SITE,
        sid,
      )
      if (count % 400 === 0 || (day === 0 && i < 3)) {
        const replay = demoRecording(start)
        db.prepare('INSERT INTO replay_chunks VALUES(?,?,?,?,?)').run(
          DEMO_SITE,
          sid,
          `demo_chunk_${count}`,
          start,
          gzipSync(JSON.stringify(replay)),
        )
      }
    }
  }
  db.prepare('INSERT INTO saved_reports VALUES(?,?,?,?,?)').run(
    'demo_saved_mobile',
    DEMO_SITE,
    owner,
    'Мобильный трафик',
    JSON.stringify({ view: 'overview', filters: { days: '30', device: 'Смартфон' } }),
  )
}

export function demoRecording(start = Date.now()) {
  let n = 1
  const text = (value) => ({ type: 3, id: n++, textContent: value })
  const el = (tag, attrs, children) => ({
    type: 2,
    id: n++,
    tagName: tag,
    attributes: attrs || {},
    childNodes: children || [],
  })
  const style = el('style', {}, [
    text(
      'body{margin:0;background:#f8f6f0;font-family:Arial,sans-serif;color:#263a39}header{padding:26px 60px;border-bottom:1px solid #ddd;display:flex;justify-content:space-between}main{padding:90px 70px}small{letter-spacing:3px;color:#83928a}h1{font-size:72px;line-height:1.05;max-width:800px;font-weight:500}p{font-size:22px;max-width:600px;color:#7b8a84;line-height:1.6}button{background:#d4ee8f;padding:22px 32px;border:0;border-radius:40px;font-size:18px;margin-top:25px}footer{padding:40px 70px;background:#ecefe4;color:#788578}',
    ),
  ])
  const button = el('button', {}, [text('Обсудить проект ↗')]),
    buttonId = button.id
  const html = el('html', { lang: 'ru' }, [
    el('head', {}, [style]),
    el('body', {}, [
      el('header', {}, [text('northline.'), el('span', {}, [text('Студия цифровых продуктов')])]),
      el('main', {}, [
        el('small', {}, [text('ДЕМОНСТРАЦИОННАЯ ЗАПИСЬ')]),
        el('h1', {}, [text('Создаём сайты, которые двигают бизнес.')]),
        el('p', {}, [
          text(
            'От первого впечатления до заявки. Стратегия, дизайн и разработка для смелых команд.',
          ),
        ]),
        button,
      ]),
      el('footer', {}, [text('Northline Studio · вымышленный сайт для демо OpenMetrika')]),
    ]),
  ])
  const doc = {
    type: 0,
    id: n++,
    childNodes: [{ type: 1, id: n++, name: 'html', publicId: '', systemId: '' }, html],
  }
  return [
    {
      type: 4,
      timestamp: start,
      data: { href: 'https://demo.example.invalid/', width: 1280, height: 900 },
    },
    { type: 2, timestamp: start + 1, data: { node: doc, initialOffset: { left: 0, top: 0 } } },
    {
      type: 3,
      timestamp: start + 3000,
      data: {
        source: 1,
        positions: [
          { x: 200, y: 300, id: buttonId, timeOffset: 0 },
          { x: 250, y: 600, id: buttonId, timeOffset: 300 },
        ],
      },
    },
    {
      type: 3,
      timestamp: start + 7000,
      data: { source: 2, type: 2, id: buttonId, x: 240, y: 650 },
    },
    { type: 3, timestamp: start + 16000, data: { source: 3, id: doc.id, x: 0, y: 120 } },
    {
      type: 3,
      timestamp: start + 20000,
      data: { source: 1, positions: [{ x: 600, y: 400, id: buttonId, timeOffset: 0 }] },
    },
  ]
}
