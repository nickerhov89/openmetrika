import React, { useState } from 'react'
import AmoCRM from './AmoCRM.jsx'

const labels = {
  lead: 'Заявка',
  qualified: 'Качественный лид',
  meeting: 'Встреча',
  won: 'Сделка выиграна',
  paid: 'Оплата',
  refund: 'Возврат',
  lost: 'Потерян',
}
const fmt = (n) =>
  n === null || n === undefined
    ? '—'
    : Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 1 })
const example = {
  events: [
    {
      event_id: 'crm-101-created',
      lead_id: 'crm-101',
      stage: 'lead',
      visitor: 'CLIENT_ID_FROM_OM',
      ts: '2026-10-27T09:00:00Z',
      currency: 'RUB',
    },
    {
      event_id: 'crm-101-paid',
      lead_id: 'crm-101',
      stage: 'paid',
      ts: '2026-10-27T10:00:00Z',
      revenue: 150000,
      cost: 60000,
      currency: 'RUB',
    },
  ],
}

export default function Business({
  base,
  query,
  version,
  useData,
  Table,
  api,
  notify,
  reload,
  editable,
  select,
  configure,
}) {
  const [metricView, setMetricView] = useState('quality'),
    [tab, setTab] = useState('channels'),
    [token, setToken] = useState(''),
    [busy, setBusy] = useState(false)
  const params = new URLSearchParams(query),
    model = params.get('attribution') === 'last' ? 'last' : 'first',
    windowDays = ['7', '30', '90'].includes(params.get('attributionDays'))
      ? params.get('attributionDays')
      : '90',
    basis = params.get('businessBasis') === 'event' ? 'event' : 'cohort',
    currency = params.get('displayCurrency') || 'RUB'
  const controlQuery = new URLSearchParams(query)
  for (const key of ['attribution', 'attributionDays', 'businessBasis', 'displayCurrency'])
    controlQuery.delete(key)
  const cleanQuery = '?' + controlQuery.toString()
  const { data, error, loading } = useData(
    base +
      '/business' +
      cleanQuery +
      '&attribution=' +
      model +
      '&attributionDays=' +
      windowDays +
      '&businessBasis=' +
      basis,
    version,
  )
  const keys = useData(editable ? base + '/integrations' : null, version)
  const rows = data?.rows.filter((r) => r.currency === currency) || []
  const totals = rows.reduce((a, r) => {
    for (const k of [
      'leads',
      'qualified',
      'meetings',
      'won',
      'customers',
      'revenue',
      'gross_profit',
    ])
      a[k] = (a[k] || 0) + r[k]
    return a
  }, {})
  const importEvents = async (body) => {
    setBusy(true)
    try {
      const result = await api(base + '/business/import', 'POST', body)
      notify(`Принято ${result.imported}, повторов ${result.duplicates}`)
      reload()
    } catch (e) {
      notify(e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <section className="card">
        <div className="cardHeading">
          <div>
            <h2>От заявки до прибыли</h2>
            <p>
              Подтверждённые результаты из CRM или серверного импорта. Данные браузера не создают
              продажи.
            </p>
          </div>
        </div>
        <div className="businessControls">
          <label>
            Атрибуция
            <select
              value={model}
              onChange={(e) => {
                configure?.({ attribution: e.target.value })
              }}
            >
              <option value="first">Первое касание</option>
              <option value="last">Последнее непрямое</option>
            </select>
          </label>
          <label>
            История касаний
            <select
              value={windowDays}
              onChange={(e) => {
                configure?.({ attributionDays: e.target.value })
              }}
            >
              {[7, 30, 90].map((n) => (
                <option key={n} value={n}>
                  {n} дней до заявки
                </option>
              ))}
            </select>
          </label>
          <label>
            Период
            <select
              value={basis}
              onChange={(e) => {
                configure?.({ businessBasis: e.target.value })
              }}
            >
              <option value="cohort">Заявки созданы в периоде</option>
              <option value="event">События продаж в периоде</option>
            </select>
          </label>
          <label>
            Валюта
            <select
              value={currency}
              onChange={(e) => {
                configure?.({ displayCurrency: e.target.value })
              }}
            >
              {[...new Set(['RUB', ...(data?.rows.map((r) => r.currency) || [])])].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="hint">
          {basis === 'cohort'
            ? 'Когорта заявок выбранного периода и вся переданная история до текущего момента.'
            : 'Активные лиды и события, попавшие в выбранный период; это не число новых заявок.'}{' '}
          Рекламные расходы — за выбранный период, по источнику, кампании и валюте. Фильтры этого
          раздела: период, источник и кампания.
        </p>
      </section>
      {loading ? (
        <div className="loading">Считаем результаты продаж…</div>
      ) : error ? (
        <p className="error">{error}</p>
      ) : (
        <>
          <div className="metrics">
            {[
              ['Лиды', 'leads'],
              ['Качественные', 'qualified'],
              ['Встречи', 'meetings'],
              ['Выиграно', 'won'],
              ['Оплатившие лиды', 'customers'],
              ['Валовая прибыль, ' + currency, 'gross_profit'],
            ].map(([name, key]) => (
              <article className="metric" key={key}>
                <span>{name}</span>
                <strong>{fmt(totals[key] || 0)}</strong>
              </article>
            ))}
          </div>
          <section className="card">
            <div className="tabs">
              {[
                ['channels', 'Экономика каналов'],
                ['leads', 'Лиды и история'],
                ['cohorts', 'Когорты'],
              ].map(([id, name]) => (
                <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
                  {name}
                </button>
              ))}
            </div>
            {tab === 'channels' && (
              <>
                <div className="reportToolbar">
                  <label>
                    Показатели{' '}
                    <select
                      aria-label="Показатели каналов"
                      value={metricView}
                      onChange={(e) => setMetricView(e.target.value)}
                    >
                      <option value="quality">Качество лидов</option>
                      <option value="economics">Экономика и окупаемость</option>
                    </select>
                  </label>
                  <a
                    className="button"
                    href={
                      '/api' +
                      base +
                      '/business' +
                      cleanQuery +
                      '&attribution=' +
                      model +
                      '&attributionDays=' +
                      windowDays +
                      '&businessBasis=' +
                      basis +
                      '&format=csv'
                    }
                    download
                  >
                    CSV
                  </a>
                </div>
                <Table
                  rows={rows}
                  columns={[
                    { key: 'source', label: 'Источник' },
                    { key: 'campaign', label: 'Кампания' },
                    { key: 'leads', label: 'Лиды' },
                    { key: 'qualified', label: 'Качественные' },
                    { key: 'meetings', label: 'Встречи' },
                    { key: 'customers', label: 'Оплатили' },
                    {
                      key: 'cost',
                      label: 'Реклама',
                      render: (n) => (n === null ? 'Не загружена' : fmt(n)),
                    },
                    { key: 'revenue', label: 'Оплаты − возвраты', render: fmt },
                    { key: 'direct_cost', label: 'Прямые затраты', render: fmt },
                    { key: 'gross_profit', label: 'Валовая прибыль', render: fmt },
                    { key: 'contribution', label: 'После рекламы', render: fmt },
                    { key: 'cpql', label: 'Цена качественного лида', render: fmt },
                    { key: 'cpm', label: 'Цена встречи', render: fmt },
                    { key: 'cac', label: 'Цена оплатившего лида', render: fmt },
                    { key: 'romi', label: 'ROMI, %', render: fmt },
                  ].filter((c) =>
                    metricView === 'quality'
                      ? [
                          'source',
                          'campaign',
                          'leads',
                          'qualified',
                          'meetings',
                          'customers',
                          'gross_profit',
                        ].includes(c.key)
                      : !['leads', 'qualified', 'meetings', 'customers'].includes(c.key),
                  )}
                />
              </>
            )}
            {tab === 'leads' && (
              <>
                <p className="hint">
                  Последние 250 из {data?.totalLeads || 0} лидов. Нажмите строку для перехода к
                  атрибутированному визиту.
                </p>
                <Table
                  rows={data?.leads.filter((l) => l.currency === currency)}
                  onRow={(r) =>
                    r.visit_id
                      ? select(r.visit_id)
                      : notify(
                          'Нет связанного визита: передайте ClientID или ID визита при создании лида',
                        )
                  }
                  columns={[
                    { key: 'id', label: 'ID лида' },
                    { key: 'source', label: 'Источник' },
                    { key: 'stage', label: 'Последний этап', render: (s) => labels[s] },
                    {
                      key: 'events',
                      label: 'Переданная история',
                      render: (events) =>
                        events
                          .map(
                            (e) =>
                              labels[e.stage] + ' ' + new Date(e.ts).toLocaleDateString('ru-RU'),
                          )
                          .join(' → '),
                    },
                    ...(editable
                      ? [
                          {
                            key: 'delete',
                            label: '',
                            render: (_, row) => (
                              <button
                                className="icon"
                                aria-label={'Удалить лид ' + row.id}
                                onClick={async (e) => {
                                  e.stopPropagation()
                                  if (
                                    !confirm(
                                      'Удалить лид ' +
                                        row.id +
                                        ' и всю его историю продаж? Восстановить через интерфейс нельзя.',
                                    )
                                  )
                                    return
                                  try {
                                    await api(
                                      base + '/business/leads/' + encodeURIComponent(row.id),
                                      'DELETE',
                                    )
                                    reload()
                                  } catch (err) {
                                    notify(err.message)
                                  }
                                }}
                              >
                                ×
                              </button>
                            ),
                          },
                        ]
                      : []),
                  ]}
                />
              </>
            )}
            {tab === 'cohorts' && (
              <Table
                rows={data?.cohorts?.filter((c) => c.currency === currency)}
                columns={[
                  { key: 'week', label: 'Неделя создания лида' },
                  { key: 'leads', label: 'Лиды' },
                  { key: 'qualified', label: 'Качественные' },
                  { key: 'customers', label: 'Оплатившие лиды' },
                  { key: 'revenue', label: 'Оплаты − возвраты', render: fmt },
                  { key: 'payment_days', label: 'Дней до первой оплаты', render: fmt },
                ]}
              />
            )}
            <p className="notice">
              Валовая прибыль = оплаты − возвраты − переданные прямые затраты. ROMI учитывает также
              рекламу. Непереданные затраты не восстанавливаются автоматически.
            </p>
            {data?.warnings.map((w) => (
              <p className="hint" key={w}>
                {w}
              </p>
            ))}
          </section>
        </>
      )}
      {editable && (
        <AmoCRM
          base={base}
          version={version}
          useData={useData}
          api={api}
          notify={notify}
          reload={reload}
        />
      )}
      {editable && (
        <details className="card businessImport">
          <summary>Подключить CRM или передать результаты продаж</summary>
          <div className="settingsBody">
            <h2>Передать результат продажи</h2>
            <p className="muted">
              ID события обеспечивает защиту от повторного импорта. Используйте обезличенные ID, без
              имён, телефонов и email. После создания лида передавайте новые этапы с тем же ID лида.
            </p>
            <form
              className="businessControls"
              onSubmit={async (e) => {
                e.preventDefault()
                const f = Object.fromEntries(new FormData(e.currentTarget))
                await importEvents({
                  events: [
                    {
                      event_id: f.event_id,
                      lead_id: f.lead_id,
                      stage: f.stage,
                      visitor: f.visitor,
                      session: f.session,
                      ts: new Date(f.ts).toISOString(),
                      revenue: Number(f.revenue || 0),
                      cost: Number(f.cost || 0),
                      currency: f.currency,
                    },
                  ],
                })
              }}
            >
              <label>
                ID лида
                <input name="lead_id" placeholder="crm-101" required />
              </label>
              <label>
                ID события
                <input name="event_id" placeholder="crm-101-paid-1" required />
              </label>
              <label>
                Этап
                <select name="stage">
                  {Object.entries(labels).map(([s, name]) => (
                    <option key={s} value={s}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Дата события
                <input type="datetime-local" name="ts" required />
              </label>
              <label>
                ClientID
                <input name="visitor" placeholder="При первой передаче" />
              </label>
              <label>
                ID визита
                <input name="session" placeholder="Вместо ClientID или вместе с ним" />
              </label>
              <label>
                Сумма оплаты/возврата
                <input name="revenue" type="number" step="0.01" min="0" defaultValue="0" />
              </label>
              <label>
                Прямые затраты
                <input name="cost" type="number" step="0.01" min="0" defaultValue="0" />
              </label>
              <label>
                Валюта
                <input name="currency" pattern="[A-Z]{3}" defaultValue="RUB" required />
              </label>
              <button className="yellow" disabled={busy}>
                Передать событие
              </button>
            </form>
            <h3>Импорт JSON</h3>
            <input
              aria-label="JSON событий продаж"
              type="file"
              accept=".json,application/json"
              disabled={busy}
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                try {
                  if (file.size > 2000000) throw Error('Файл должен быть меньше 2 МБ')
                  await importEvents(JSON.parse(await file.text()))
                } catch (err) {
                  notify(err.message)
                }
                e.target.value = ''
              }}
            />
            <details>
              <summary>Формат событий</summary>
              <pre>{JSON.stringify(example, null, 2)}</pre>
            </details>
            <h3>Серверный ключ интеграции</h3>
            <p className="hint">
              Разрешает только POST /api{base}/business/import. Храните на сервере CRM; не
              вставляйте в сайт. Существующие ключи отчётов остаются только для чтения.
            </p>
            {token && (
              <div className="notice">
                <b>Сохраните сейчас: повторно ключ не показывается.</b>
                <pre>{token}</pre>
              </div>
            )}
            <form
              className="inlineForm"
              onSubmit={async (e) => {
                e.preventDefault()
                try {
                  const f = Object.fromEntries(new FormData(e.currentTarget))
                  const key = await api(base + '/integrations', 'POST', f)
                  setToken(key.token)
                  reload()
                } catch (err) {
                  notify(err.message)
                }
              }}
            >
              <input
                name="name"
                aria-label="Название интеграции"
                placeholder="CRM / webhook / n8n"
                required
              />
              <button className="button">Создать ключ импорта</button>
            </form>
            <Table
              rows={keys.data}
              columns={[
                { key: 'name', label: 'Интеграция' },
                {
                  key: 'created_at',
                  label: 'Создана',
                  render: (n) => new Date(n).toLocaleDateString('ru-RU'),
                },
                {
                  key: 'id',
                  label: 'Доступ',
                  render: (id) => (
                    <button
                      className="textButton"
                      onClick={async () => {
                        try {
                          await api(base + '/integrations/' + id, 'DELETE')
                          reload()
                        } catch (e) {
                          notify(e.message)
                        }
                      }}
                    >
                      Отозвать
                    </button>
                  ),
                },
              ]}
            />
          </div>
        </details>
      )}
    </>
  )
}
