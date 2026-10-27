import React, { useEffect, useRef, useState } from 'react'

const stages = {
  '': 'Только заявка / не учитывать этап',
  qualified: 'Качественный лид',
  meeting: 'Встреча',
  won: 'Выиграно',
  lost: 'Потеряно',
}
const defaults = {
  pipelines: [],
  mapping: {},
  visitorField: 0,
  paymentField: 0,
  currency: 'RUB',
  automatic: true,
}

export default function AmoCRM({ base, version, useData, api, notify, reload }) {
  const [poll, setPoll] = useState(0),
    [catalog, setCatalog] = useState(null),
    [draft, setDraft] = useState(defaults),
    [busy, setBusy] = useState(false)
  const { data, error } = useData(base + '/amocrm', `${version}:${poll}`)
  const previousSync = useRef(null)
  useEffect(() => {
    if (!data) return
    if (previousSync.current?.base === base && previousSync.current.time !== data.lastSync) reload()
    previousSync.current = { base, time: data.lastSync }
  }, [base, data?.lastSync])
  const config = JSON.stringify(data?.config || {})
  useEffect(() => {
    setDraft({ ...defaults, ...JSON.parse(config) })
  }, [config, base])
  useEffect(() => {
    setCatalog(null)
  }, [base, data?.host])
  useEffect(() => {
    if (!data?.connected) return
    const timer = setInterval(() => setPoll((p) => p + 1), data.busy ? 2000 : 15000)
    return () => clearInterval(timer)
  }, [data?.connected, data?.busy])
  const run = async (fn) => {
    setBusy(true)
    try {
      await fn()
      reload()
      setPoll((p) => p + 1)
    } catch (e) {
      notify(e.message)
    } finally {
      setBusy(false)
    }
  }
  const field = (key, title, numeric = false) => (
    <label>
      {title}
      <select
        value={draft[key]}
        onChange={(e) => setDraft((d) => ({ ...d, [key]: Number(e.target.value) }))}
        disabled={busy || (key === 'paymentField' && Boolean(data?.financialLocked))}
      >
        <option value="0">Не передавать</option>
        {catalog?.fields
          .filter((f) => !numeric || ['numeric', 'monetary'].includes(f.type))
          .map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} · {f.id}
            </option>
          ))}
      </select>
    </label>
  )
  return (
    <section className="card amoCard">
      <div className="amoHeader">
        <div>
          <h2>amoCRM → лиды и прибыль</h2>
          <p className="muted">Какая реклама приводит качественные заявки, встречи и деньги.</p>
        </div>
        <span className="badge">
          {data?.connected ? (data.busy ? 'Синхронизация…' : 'Подключена') : 'Не подключена'}
        </span>
      </div>
      {error && <p className="error">{error}</p>}
      {data && !data.configured && (
        <div className="notice">
          Для подключения настройте на сервере AMO_CLIENT_ID, AMO_CLIENT_SECRET, AMO_REDIRECT_URI и
          AMO_TOKEN_ENCRYPTION_KEY.{' '}
          <a
            href="https://github.com/nickerhov89/openmetrika/blob/main/docs/AMOCRM.md"
            target="_blank"
            rel="noreferrer"
          >
            Инструкция подключения ↗
          </a>
          <p>
            В публичном демо внешние аккаунты не подключаются. В своей установке настройку выполняет
            владелец счётчика.
          </p>
        </div>
      )}
      {data?.configured && !data.connected && (
        <form
          className="inlineForm"
          onSubmit={(e) => {
            e.preventDefault()
            const host = new FormData(e.currentTarget).get('host')
            run(async () => {
              const result = await api(base + '/amocrm/connect', 'POST', { host })
              location.assign(result.url)
            })
          }}
        >
          <input
            aria-label="Адрес аккаунта amoCRM"
            name="host"
            placeholder="company.amocrm.ru"
            defaultValue={data.host}
            required
            disabled={busy}
          />
          <button className="yellow" disabled={busy}>
            Подключить через amoCRM ↗
          </button>
        </form>
      )}
      {data?.connected && (
        <>
          <p>
            <b>{data.host}</b> · Последний импорт:{' '}
            {data.lastSync ? new Date(data.lastSync).toLocaleString('ru-RU') : 'ещё не запускался'}
          </p>
          {data.error && (
            <p className="error" role="alert">
              {data.error}
            </p>
          )}
          {data.lastSync > 0 && (
            <p className="hint">
              За последний проход: {data.stats.leads || 0} сделок, {data.stats.matched || 0} с
              ClientID, {data.stats.imported || 0} новых событий. Это число обработанных сделок, не
              весь аккаунт.
            </p>
          )}
          <div className="inlineForm">
            <button
              className="button"
              disabled={busy || data.busy}
              onClick={() =>
                run(async () => {
                  setCatalog(await api(base + '/amocrm/catalog'))
                })
              }
            >
              Загрузить воронки и поля
            </button>
            <button
              className="yellow"
              disabled={busy || data.busy || !data.config.pipelines?.length}
              onClick={() =>
                run(async () => {
                  await api(base + '/amocrm/sync', 'POST')
                  notify('Импорт запущен. Статус обновится автоматически')
                })
              }
            >
              Синхронизировать
            </button>
            <button
              className="textButton"
              disabled={busy || data.busy}
              onClick={() => {
                if (
                  confirm(
                    'Отключить amoCRM? Токены будут удалены, импортированные результаты сохранятся.',
                  )
                )
                  run(async () => {
                    await api(base + '/amocrm', 'DELETE')
                    setCatalog(null)
                  })
              }}
            >
              Отключить
            </button>
          </div>
          {catalog && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                run(async () => {
                  await api(base + '/amocrm', 'PATCH', draft)
                  notify('Настройки amoCRM сохранены')
                })
              }}
            >
              <h3>1. Воронки и этапы</h3>
              {catalog.pipelines.map((p) => (
                <fieldset key={p.id} className="amoPipeline">
                  <legend>
                    <label>
                      <input
                        type="checkbox"
                        checked={draft.pipelines.includes(p.id)}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            pipelines: e.target.checked
                              ? [...d.pipelines, p.id]
                              : d.pipelines.filter((id) => id !== p.id),
                          }))
                        }
                      />{' '}
                      {p.name}
                    </label>
                  </legend>
                  {draft.pipelines.includes(p.id) && (
                    <div className="businessControls">
                      {p.statuses.map((s) => (
                        <label key={s.id}>
                          {s.name}
                          <select
                            value={
                              draft.mapping[`${p.id}:${s.id}`] ||
                              (s.id === 142 ? 'won' : s.id === 143 ? 'lost' : '')
                            }
                            onChange={(e) =>
                              setDraft((d) => {
                                const mapping = { ...d.mapping }
                                if (e.target.value) mapping[`${p.id}:${s.id}`] = e.target.value
                                else delete mapping[`${p.id}:${s.id}`]
                                return { ...d, mapping }
                              })
                            }
                            disabled={[142, 143].includes(s.id)}
                          >
                            {Object.entries(stages).map(([v, name]) => (
                              <option value={v} key={v}>
                                {name}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                  )}
                </fieldset>
              ))}
              <h3>2. Связь с посетителем и реальные оплаты</h3>
              <div className="businessControls">
                {field('visitorField', 'Поле ClientID в сделке')}
                {field('paymentField', 'Поле «Оплачено минус возвраты»', true)}
                <label>
                  Валюта сумм
                  <input
                    value={draft.currency}
                    pattern="[A-Z]{3}"
                    maxLength="3"
                    disabled={Boolean(data.financialLocked)}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, currency: e.target.value.toUpperCase() }))
                    }
                    required
                  />
                </label>
              </div>
              <p className="notice">
                Бюджет сделки не считается оплатой. Выберите числовое поле с накопленной суммой
                реальных оплат за вычетом возвратов. Рост суммы добавит оплату, уменьшение —
                возврат. Пустое поле сохраняет прошлую сумму, явный 0 означает полный возврат. После
                первого импорта поле и валюта фиксируются.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={draft.automatic}
                  onChange={(e) => setDraft((d) => ({ ...d, automatic: e.target.checked }))}
                />{' '}
                Синхронизировать каждые 15 минут
              </label>
              <p>
                <button className="yellow" disabled={busy || data.busy}>
                  Сохранить настройки amoCRM
                </button>
              </p>
            </form>
          )}
        </>
      )}
      <details className="amoHelp">
        <summary>Как связать сайт с рекламой и что попадёт в отчёт</summary>
        <p>
          На сайте получите <code>window.om('getClientId')</code> после согласия на аналитику и
          передайте этот ID через свой обработчик формы в отдельное текстовое поле сделки amoCRM.
          Затем выберите это поле здесь. Без ClientID результаты останутся без атрибуции к рекламе.
        </p>
        <p>
          Импортируются дата создания и наблюдаемые этапы выбранных воронок. Пропущенные между
          синхронизациями этапы не восстанавливаются. Дата оплаты — время обнаружения изменения, а
          не банковская дата платежа. Для точного учёта по датам используйте API событий продаж.
        </p>
        <p>
          Имена, телефоны и email не сохраняются. Соединение только читает amoCRM; сделки и контакты
          не изменяются. Прямые затраты передавайте отдельно через API событий продаж.
        </p>
      </details>
    </section>
  )
}
