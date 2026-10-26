import React, { useState, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import {
  LayoutDashboard,
  ChartNoAxesCombined,
  MousePointer2,
  Video,
  Goal,
  Settings,
  ChevronDown,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  Search,
  X,
  ExternalLink,
  Globe,
  Menu,
  LogOut,
  ChevronRight,
  Filter,
  Play,
  Copy,
  Check,
  Activity,
  ShoppingBag,
  GitFork,
  Bookmark,
  Trash2,
  Code,
  Users,
} from 'lucide-react'
import 'rrweb-player/dist/style.css'
import './style.css'
const MapOverlay = React.lazy(() => import('./MapOverlay.jsx'))

const fmt = (n) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(n || 0)
const date = (n) =>
  new Date(n).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
const secs = (n) =>
  `${Math.floor((n || 0) / 60)}:${String(Math.round((n || 0) % 60)).padStart(2, '0')}`
async function api(path, method = 'GET', body) {
  const r = await fetch('/api' + path, {
    method,
    headers: method !== 'GET' ? { 'Content-Type': 'application/json' } : undefined,
    body: method !== 'GET' ? JSON.stringify(body || {}) : undefined,
  })
  const result = await r.json()
  if (!r.ok) throw Error(result.error || 'Ошибка запроса')
  return result
}
function useData(path, version = 0) {
  const [state, set] = useState({ data: null, error: '', loading: true })
  useEffect(() => {
    let alive = true
    set((s) => ({ ...s, loading: true, error: '' }))
    const load = () =>
      path &&
      api(path)
        .then((data) => alive && set({ data, error: '', loading: false }))
        .catch((e) => alive && set({ data: null, error: e.message, loading: false }))
    if (path) load()
    else set({ data: null, error: '', loading: false })
    const timer = path?.includes('/overview') ? setInterval(load, 30000) : null
    return () => {
      alive = false
      if (timer) clearInterval(timer)
    }
  }, [path, version])
  return state
}
const nav = [
  ['overview', 'Сводка', LayoutDashboard],
  ['reports', 'Отчёты', ChartNoAxesCombined],
  ['visits', 'Посетители', Users],
  ['replay', 'Записи сессий', Video],
  ['maps', 'Карты поведения', MousePointer2],
  ['goals', 'Цели', Goal],
  ['funnels', 'Воронки', GitFork],
  ['ecommerce', 'Электронная коммерция', ShoppingBag],
  ['acquisition', 'Сквозная аналитика', Activity],
  ['settings', 'Настройки', Settings],
]
const titles = Object.fromEntries(nav.map(([id, name]) => [id, name]))
function Empty({
  title = 'Данных пока нет',
  text = 'Подключите счётчик к сайту или измените выбранный период.',
}) {
  return (
    <div className="empty">
      <Activity size={36} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  )
}
function Modal({ title, children, close, wide = false }) {
  const ref = useRef(),
    closeRef = useRef(close)
  closeRef.current = close
  useEffect(() => {
    const prior = document.activeElement,
      overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ref.current?.querySelector('button')?.focus()
    const key = (e) => {
      if (e.key === 'Escape') closeRef.current()
      if (e.key !== 'Tab') return
      const controls = [
        ...ref.current.querySelectorAll(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
        ),
      ].filter((el) => el.offsetParent !== null)
      if (!controls.length) return
      if (e.shiftKey && document.activeElement === controls[0]) {
        e.preventDefault()
        controls.at(-1).focus()
      }
      if (!e.shiftKey && document.activeElement === controls.at(-1)) {
        e.preventDefault()
        controls[0].focus()
      }
    }
    document.addEventListener('keydown', key)
    return () => {
      document.body.style.overflow = overflow
      document.removeEventListener('keydown', key)
      prior?.focus?.()
    }
  }, [])
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <section
        ref={ref}
        className={'modal ' + (wide ? 'wide' : '')}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <button className="icon" aria-label="Закрыть" onClick={close}>
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  )
}
function Field({ label, children, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children || <input {...props} />}
    </label>
  )
}
function Table({ rows, columns, onRow }) {
  const [sort, setSort] = useState(null)
  if (!rows?.length) return <Empty />
  const ordered = sort
    ? [...rows].sort((a, b) => {
        const av = a[sort.key],
          bv = b[sort.key]
        const n =
          typeof av === 'number' && typeof bv === 'number'
            ? av - bv
            : String(av ?? '').localeCompare(String(bv ?? ''), 'ru')
        return sort.desc ? -n : n
      })
    : rows
  return (
    <div className="tableScroll">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                aria-sort={sort?.key === c.key ? (sort.desc ? 'descending' : 'ascending') : 'none'}
              >
                {c.label ? (
                  <button
                    className="sortHeading"
                    onClick={() =>
                      setSort((s) => ({ key: c.key, desc: s?.key === c.key ? !s.desc : true }))
                    }
                  >
                    {c.label}
                    {sort?.key === c.key ? (sort.desc ? ' ↓' : ' ↑') : ''}
                  </button>
                ) : (
                  ''
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordered.map((r, i) => (
            <tr
              key={r.id || r.order_id || i}
              tabIndex={onRow ? 0 : undefined}
              onKeyDown={(e) => {
                if (onRow && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  onRow(r)
                }
              }}
              onClick={() => onRow?.(r)}
              className={onRow ? 'clickable' : ''}
            >
              {columns.map((c) => (
                <td key={c.key}>
                  {c.render
                    ? c.render(r[c.key], r)
                    : typeof r[c.key] === 'number'
                      ? fmt(r[c.key])
                      : r[c.key] || '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
function Chart({ rows = [] }) {
  if (!rows.some((r) => r.visits)) return <Empty />
  const max = Math.max(...rows.map((r) => r.visits), 1),
    w = 1000,
    h = 240,
    points = (key) =>
      rows
        .map((r, i) => `${(i / (rows.length - 1 || 1)) * w},${h - (r[key] / max) * (h - 15)}`)
        .join(' ')
  return (
    <div className="chart">
      <div className="chartYAxis">
        {[max, Math.round(max * 0.75), Math.round(max * 0.5), Math.round(max * 0.25), 0].map(
          (n, i) => (
            <span key={i}>{fmt(n)}</span>
          ),
        )}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Динамика визитов и посетителей">
        <defs>
          <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#e2c300" stopOpacity=".16" />
            <stop offset="1" stopColor="#e2c300" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((y) => (
          <line
            key={y}
            x1="0"
            y1={y * h}
            x2={w}
            y2={y * h}
            stroke="#eceef1"
            strokeDasharray="4 5"
          />
        ))}
        <polygon points={`0,${h} ${points('visits')} ${w},${h}`} fill="url(#fill)" />
        <polyline points={points('visits')} fill="none" stroke="#d4b500" strokeWidth="3" />
        <polyline points={points('visitors')} fill="none" stroke="#6594eb" strokeWidth="2.5" />
        {rows.map((r, i) => (
          <circle
            key={r.day}
            cx={(i / (rows.length - 1 || 1)) * w}
            cy={h - (r.visits / max) * (h - 15)}
            r="5"
            fill="transparent"
          >
            <title>
              {r.day}: {fmt(r.visits)} визитов · {fmt(r.visitors)} посетителей
            </title>
          </circle>
        ))}
      </svg>
      <div className="chartDates">
        {rows
          .filter(
            (_, i) =>
              i === 0 ||
              i === rows.length - 1 ||
              i % Math.max(1, Math.floor(rows.length / 5)) === 0,
          )
          .map((r) => (
            <span key={r.day}>
              {r.day.slice(8)}.{r.day.slice(5, 7)}
            </span>
          ))}
      </div>
    </div>
  )
}
function Auth({ setup, onDone }) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  return (
    <div className="auth">
      <div className="brand">
        <span className="brandMark">m.</span>OpenMetrika
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          try {
            await api(
              setup ? '/setup' : '/login',
              'POST',
              Object.fromEntries(new FormData(e.currentTarget)),
            )
            onDone()
          } catch (e) {
            setError(e.message)
          } finally {
            setBusy(false)
          }
        }}
      >
        <span className="eyebrow">ВАШИ ДАННЫЕ. ВАШ СЕРВЕР.</span>
        <h1>{setup ? 'Создайте администратора' : 'Войти в OpenMetrika'}</h1>
        <p>Открытая веб-аналитика, которая помогает понять своих посетителей.</p>
        {setup && <Field label="Ваше имя" name="name" required autoComplete="name" />}
        <Field label="Email" type="email" name="email" autoComplete="username" required />
        <Field
          label="Пароль"
          type="password"
          name="password"
          minLength={setup ? 12 : 1}
          maxLength={256}
          autoComplete={setup ? 'new-password' : 'current-password'}
          required
        />
        {error && <p className="error">{error}</p>}
        <button className="yellow" disabled={busy}>
          {busy ? 'Подождите…' : setup ? 'Создать аккаунт' : 'Войти'}
          <ArrowUpRight size={18} />
        </button>
      </form>
      <small>Open source · MIT · Сделано в Polza Agency</small>
    </div>
  )
}
function App() {
  const [session, setSession] = useState(null),
    [authError, setAuthError] = useState(''),
    [version, bump] = useState(0),
    [siteId, setSiteId] = useState(localStorage.getItem('om_site') || ''),
    [view, setView] = useState(location.hash.slice(1) || 'overview'),
    [modal, setModal] = useState(null),
    [toast, setToast] = useState(''),
    [mobile, setMobile] = useState(false)
  const [filters, setFilters] = useState({ days: '30' }),
    [showFilters, setShowFilters] = useState(false),
    [report, setReport] = useState('sources'),
    [selectedVisit, setSelectedVisit] = useState(null)
  const reload = () => bump((v) => v + 1),
    notify = (msg) => {
      setToast(msg)
      setTimeout(() => setToast(''), 5000)
    }
  useEffect(() => {
    api('/me')
      .then(setSession)
      .catch((e) => setAuthError(e.message))
  }, [version])
  useEffect(() => {
    const handler = () => setView(location.hash.slice(1) || 'overview')
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])
  const sites = useData(session?.user ? '/sites' : null, version),
    site = sites.data?.find((s) => s.id === siteId) || sites.data?.[0]
  useEffect(() => {
    if (site) {
      setSiteId(site.id)
      localStorage.setItem('om_site', site.id)
    }
  }, [site?.id])
  const base = site ? `/sites/${site.id}` : '',
    q = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString(),
    query = '?' + q
  const summary = useData(base ? base + '/overview' + query : null, version),
    saved = useData(base ? base + '/saved' : null, version)
  const go = (id) => {
    location.hash = id
    setView(id)
    setMobile(false)
  }
  const mutate = async (path, method, body) => {
    try {
      const result = await api(base + path, method, body)
      reload()
      return result
    } catch (e) {
      notify(e.message)
      throw e
    }
  }
  if (authError) return <Empty title="Не удалось подключиться" text={authError} />
  if (!session) return <div className="loading">Загружаем OpenMetrika…</div>
  if (!session.user) return <Auth setup={session.setup} onDone={reload} />
  const change = (key, value) => setFilters((f) => ({ ...f, [key]: value }))
  return (
    <div className="shell">
      <aside className={mobile ? 'sidebar open' : 'sidebar'}>
        <a href="#overview" className="brand">
          <span className="brandMark">m.</span>
          <span>
            OpenMetrika<small>Веб-аналитика</small>
          </span>
        </a>
        <div className="sitePicker">
          <Globe size={18} />
          <select
            aria-label="Выбрать счётчик"
            value={site?.id || ''}
            onChange={(e) => {
              setSiteId(e.target.value)
              setFilters({ days: '30' })
            }}
          >
            {sites.data?.map((s) => (
              <option value={s.id} key={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button className="icon" aria-label="Добавить счётчик" onClick={() => setModal('site')}>
            <Plus size={17} />
          </button>
        </div>
        <nav>
          {nav.map(([id, name, Icon]) => (
            <button key={id} className={view === id ? 'active' : ''} onClick={() => go(id)}>
              <Icon size={19} />
              {name}
              {id === 'replay' && <span className="tiny">REC</span>}
            </button>
          ))}
        </nav>
        <div className="sidebarBottom">
          <a
            className="agencyAd"
            href="https://polzaagency.ru/?utm_source=openmetrika&utm_medium=product&utm_campaign=sidebar"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>НУЖНЫ КЛИЕНТЫ B2B?</span>
            <strong>
              Наполним вашу
              <br />
              воронку.
            </strong>
            <span className="adLink">
              Polza Agency <ArrowUpRight size={15} />
            </span>
          </a>
          <div className="account">
            <span className="avatar">{session.user.name.slice(0, 1)}</span>
            <div>
              <b>{session.user.name}</b>
              <small>{session.demo ? 'Демонстрационный режим' : 'Личный аккаунт'}</small>
            </div>
            {!session.demo && (
              <button
                className="icon"
                aria-label="Выйти"
                onClick={async () => {
                  await api('/logout', 'POST', {})
                  reload()
                }}
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <button
            className="icon mobileMenu"
            aria-label="Открыть меню"
            onClick={() => setMobile(!mobile)}
          >
            <Menu size={22} />
          </button>
          <div className="breadcrumb">
            Счётчики <ChevronRight size={14} /> <b>{site?.name || 'Новый счётчик'}</b>
          </div>
          <div className="topRight">
            <span className="localTag">
              <span />
              Self-hosted
            </span>
            <a href="https://polzaagency.ru/" target="_blank" rel="noopener noreferrer">
              by Polza <ArrowUpRight size={14} />
            </a>
          </div>
        </header>
        <div className="content">
          <div className="pageTitle">
            <div>
              <span className="eyebrow">{site?.domains?.[0] || 'ДОБРО ПОЖАЛОВАТЬ'}</span>
              <h1>{titles[view] || 'Сводка'}</h1>
            </div>
            <div className="titleActions">
              {summary.data && (
                <span className="live">
                  <i />
                  {fmt(summary.data.live)} сейчас на сайте
                </span>
              )}
              <button className="button" onClick={() => setModal('save')} disabled={!site}>
                <Bookmark size={16} />
                Сохранить
              </button>
            </div>
          </div>
          {session.demo && (
            <div className="demoBanner">
              <span className="badge">ДЕМО</span>Вымышленные данные для знакомства с продуктом.
              Реальный тестовый сайт:{' '}
              <a href="/fixture/" target="_blank" rel="noopener noreferrer">
                открыть <ExternalLink size={13} />
              </a>
            </div>
          )}
          {!site ? (
            <div className="card onboarding">
              <Globe size={44} />
              <h2>Добавьте свой первый сайт</h2>
              <p>Получите короткий код счётчика и начните собирать реальные посещения.</p>
              <button className="yellow" onClick={() => setModal('site')}>
                <Plus size={18} />
                Добавить счётчик
              </button>
            </div>
          ) : (
            <>
              <div className="filterBar">
                <div className="periodButtons">
                  {[
                    ['1', 'Сегодня'],
                    ['7', '7 дней'],
                    ['30', '30 дней'],
                    ['90', '90 дней'],
                  ].map(([days, label]) => (
                    <button
                      key={days}
                      className={filters.days === days && !filters.from ? 'selected' : ''}
                      onClick={() => setFilters((f) => ({ ...f, days, from: '', to: '' }))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="dateInputs">
                  <input
                    type="date"
                    aria-label="Начало периода"
                    value={filters.from || ''}
                    onChange={(e) => change('from', e.target.value)}
                  />
                  <span>—</span>
                  <input
                    type="date"
                    aria-label="Конец периода"
                    value={filters.to || ''}
                    onChange={(e) => change('to', e.target.value)}
                  />
                </div>
                <button
                  className={'button ' + (showFilters ? 'selected' : '')}
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <Filter size={15} />
                  Сегмент
                  {Object.keys(filters).some(
                    (k) => !['days', 'from', 'to'].includes(k) && filters[k],
                  ) && <i className="filterDot" />}
                </button>
              </div>
              {showFilters && (
                <div className="segmentBox">
                  <Field label="Источник">
                    <input
                      placeholder="Например, Google"
                      value={filters.source || ''}
                      onChange={(e) => change('source', e.target.value)}
                    />
                  </Field>
                  <Field label="Устройство">
                    <select
                      value={filters.device || ''}
                      onChange={(e) => change('device', e.target.value)}
                    >
                      <option value="">Все устройства</option>
                      {['Компьютер', 'Смартфон', 'Планшет'].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Страница">
                    <input
                      placeholder="/pricing"
                      value={filters.path || ''}
                      onChange={(e) => change('path', e.target.value)}
                    />
                  </Field>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={filters.converted === '1'}
                      onChange={(e) => change('converted', e.target.checked ? '1' : '')}
                    />
                    С достижением цели
                  </label>
                  <button className="textButton" onClick={() => setFilters({ days: '30' })}>
                    Сбросить
                  </button>
                </div>
              )}
              {saved.data?.length > 0 && (
                <div className="savedReports">
                  <Bookmark size={14} />
                  {saved.data.map((s) => (
                    <span key={s.id}>
                      <button
                        onClick={() => {
                          setFilters(s.config.filters || { days: '30' })
                          setReport(s.config.report || 'sources')
                          go(s.config.view || 'overview')
                        }}
                      >
                        {s.name}
                      </button>
                      <button
                        aria-label={'Удалить ' + s.name}
                        onClick={() => mutate('/saved/' + s.id, 'DELETE').catch(() => {})}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {summary.error && <p className="error">{summary.error}</p>}
              {view === 'overview' && (
                <Overview data={summary.data} base={base} query={query} version={version} go={go} />
              )}
              {view === 'reports' && (
                <Reports
                  base={base}
                  query={query}
                  version={version}
                  report={report}
                  setReport={setReport}
                />
              )}
              {(view === 'visits' || view === 'replay') && (
                <Visits
                  base={base}
                  query={query + (view === 'replay' ? '&replay=1' : '')}
                  version={version}
                  select={setSelectedVisit}
                  replay={view === 'replay'}
                />
              )}
              {view === 'maps' && <Maps base={base} query={query} version={version} />}
              {view === 'goals' && (
                <Goals
                  base={base}
                  query={query}
                  version={version}
                  add={() => setModal('goal')}
                  remove={(id) => mutate('/goals/' + id, 'DELETE').catch(() => {})}
                  editable={site.role !== 'viewer' && !session.readOnly}
                />
              )}
              {view === 'funnels' && (
                <Funnels
                  base={base}
                  query={query}
                  version={version}
                  add={() => setModal('funnel')}
                  remove={(id) => mutate('/funnels/' + id, 'DELETE').catch(() => {})}
                  editable={site.role !== 'viewer' && !session.readOnly}
                />
              )}
              {view === 'ecommerce' && <Commerce base={base} query={query} version={version} />}
              {view === 'acquisition' && (
                <Acquisition
                  base={base}
                  query={query}
                  version={version}
                  mutate={mutate}
                  notify={notify}
                  editable={site.role === 'owner' && !session.readOnly}
                />
              )}
              {view === 'settings' && (
                <SettingsPage
                  site={site}
                  base={base}
                  version={version}
                  mutate={mutate}
                  notify={notify}
                  readOnly={session.readOnly}
                />
              )}
            </>
          )}
          <footer className="footer">
            <span>OpenMetrika · Открытая аналитика · Время отчётов: UTC</span>
            <a
              href="https://polzaagency.ru/?utm_source=openmetrika&utm_medium=product&utm_campaign=footer"
              target="_blank"
              rel="noopener noreferrer"
            >
              Привлечение B2B-клиентов — Polza Agency ↗
            </a>
          </footer>
        </div>
      </main>
      {toast && (
        <div role="status" className="toast">
          {toast}
        </div>
      )}
      {modal && (
        <Modal
          title={
            {
              site: 'Новый счётчик',
              goal: 'Добавить цель',
              funnel: 'Новая воронка',
              save: 'Сохранить отчёт',
            }[modal]
          }
          close={() => setModal(null)}
        >
          <form
            className="modalForm"
            onSubmit={async (e) => {
              e.preventDefault()
              const f = Object.fromEntries(new FormData(e.currentTarget))
              try {
                if (modal === 'site') {
                  const result = await api('/sites', 'POST', {
                    name: f.name,
                    domains: f.domains.split(',').map((s) => s.trim()),
                    replay: f.replay === 'on',
                  })
                  setSiteId(result.id)
                  go('settings')
                }
                if (modal === 'goal') await mutate('/goals', 'POST', f)
                if (modal === 'save')
                  await mutate('/saved', 'POST', {
                    name: f.name,
                    config: { view, filters, report },
                  })
                if (modal === 'funnel')
                  await mutate('/funnels', 'POST', {
                    name: f.name,
                    steps: f.steps
                      .split('\n')
                      .filter(Boolean)
                      .map((line) => {
                        const pos = line.indexOf(':')
                        return {
                          kind: line.slice(0, pos).trim(),
                          value: line.slice(pos + 1).trim(),
                        }
                      }),
                  })
                setModal(null)
                reload()
              } catch (e) {
                notify(e.message)
              }
            }}
          >
            <Field label="Название" name="name" required />
            {modal === 'site' && (
              <>
                <Field
                  label="Домены через запятую, без путей"
                  name="domains"
                  placeholder="example.ru, www.example.ru"
                  required
                />
                <label className="check">
                  <input type="checkbox" name="replay" />
                  Разрешить запись сессий (поля ввода маскируются)
                </label>
              </>
            )}
            {modal === 'goal' && (
              <>
                <Field label="Тип цели">
                  <select name="kind">
                    <option value="event">JavaScript-событие</option>
                    <option value="page">Посещение страницы</option>
                  </select>
                </Field>
                <Field
                  label="Имя события или точный путь страницы"
                  name="value"
                  placeholder="lead_sent или /thank-you"
                  required
                />
                <p className="hint">Цели учитываются с момента создания.</p>
              </>
            )}
            {modal === 'funnel' && (
              <>
                <Field label="Шаги: page:/путь или event:имя, по одному на строку">
                  <textarea
                    name="steps"
                    rows="5"
                    defaultValue={'page:/\npage:/pricing\nevent:lead_sent'}
                    required
                  />
                </Field>
                <p className="hint">Шаги учитываются в указанном порядке внутри одного визита.</p>
              </>
            )}
            <button className="yellow" disabled={session.readOnly}>
              Сохранить
            </button>
          </form>
        </Modal>
      )}
      {selectedVisit && (
        <VisitDetail base={base} visit={selectedVisit} close={() => setSelectedVisit(null)} />
      )}
    </div>
  )
}
function Overview({ data, base, query, version, go }) {
  const sources = useData(base + '/reports/sources' + query, version),
    pages = useData(base + '/reports/pages' + query, version)
  if (!data) return <div className="loading">Считаем показатели…</div>
  const metrics = [
    ['Визиты', 'visits', false],
    ['Посетители', 'visitors', false],
    ['Просмотры', 'pageviews', false],
    ['Отказы', 'bounce_rate', true],
    ['Время на сайте', 'active_seconds', false],
    ['Конверсия', 'conversion_rate', true],
  ]
  return (
    <>
      <div className="metrics">
        {metrics.map(([title, key, pct]) => {
          const n = data.current[key],
            prev = data.previous[key],
            delta = prev ? Math.round(((n - prev) / prev) * 100) : null
          return (
            <article className="metric" key={key}>
              <span>{title}</span>
              <strong>{key === 'active_seconds' ? secs(n) : fmt(n) + (pct ? '%' : '')}</strong>
              <small
                className={
                  delta === null
                    ? 'muted'
                    : (key === 'bounce_rate' ? delta <= 0 : delta >= 0)
                      ? 'positive'
                      : 'negative'
                }
              >
                {delta !== null ? (
                  <>
                    {delta >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{' '}
                    {Math.abs(delta)}% <em>к предыдущему периоду</em>
                  </>
                ) : (
                  <>
                    — <em>нет базы сравнения</em>
                  </>
                )}
              </small>
            </article>
          )
        })}
      </div>
      <section className="card">
        <div className="cardHeading">
          <div>
            <h2>Посещаемость</h2>
            <p>Как меняется интерес к вашему сайту</p>
          </div>
          <div className="legend">
            <span>
              <i />
              Визиты
            </span>
            <span>
              <i />
              Посетители
            </span>
          </div>
        </div>
        <Chart rows={data.timeline} />
      </section>
      <div className="twoColumns">
        <section className="card">
          <div className="cardHeading">
            <h2>Источники трафика</h2>
            <button className="textButton" onClick={() => go('reports')}>
              Все источники <ChevronRight size={15} />
            </button>
          </div>
          <div className="barList">
            {sources.data?.slice(0, 5).map((s, i) => (
              <div key={s.label}>
                <span
                  className="sourceIcon"
                  style={{ background: ['#fff6cb', '#edf3ff', '#f2ecff', '#e8f6ef', '#fff0e9'][i] }}
                >
                  {s.source.slice(0, 1)}
                </span>
                <span>
                  <b>{s.source}</b>
                  <div className="barTrack">
                    <i style={{ width: `${(s.visits / (data.current.visits || 1)) * 100}%` }} />
                  </div>
                </span>
                <strong>{fmt(s.visits)}</strong>
                <small>{fmt((s.visits / (data.current.visits || 1)) * 100)}%</small>
              </div>
            ))}
            {!sources.data?.length && <Empty />}
          </div>
        </section>
        <section className="card">
          <div className="cardHeading">
            <h2>Популярные страницы</h2>
            <button className="textButton" onClick={() => go('reports')}>
              Все страницы <ChevronRight size={15} />
            </button>
          </div>
          <Table
            rows={pages.data?.slice(0, 5)}
            columns={[
              { key: 'label', label: 'Страница' },
              { key: 'pageviews', label: 'Просмотры' },
            ]}
          />
        </section>
      </div>
      <div className="insight">
        <span className="insightIcon">
          <Goal size={21} />
        </span>
        <div>
          <b>От визита — к следующему шагу</b>
          <p>
            Настройте цели, чтобы видеть, какие источники приводят заявки, а не только просмотры.
          </p>
        </div>
        <button className="button" onClick={() => go('goals')}>
          Настроить цели <ArrowUpRight size={16} />
        </button>
      </div>
    </>
  )
}
const reportOptions = [
  ['sources', 'Источники'],
  ['campaigns', 'UTM-кампании'],
  ['pages', 'Страницы'],
  ['entry', 'Страницы входа'],
  ['exit', 'Страницы выхода'],
  ['devices', 'Устройства'],
  ['browsers', 'Браузеры'],
  ['os', 'Операционные системы'],
  ['countries', 'Страны'],
  ['events', 'События'],
  ['performance', 'Скорость загрузки'],
  ['errors', 'Ошибки JavaScript'],
  ['retention', 'Возвращаемость по неделям'],
]
function Reports({ base, query, version, report, setReport }) {
  const { data, error, loading } = useData(base + '/reports/' + report + query, version)
  let columns = [
    { key: 'label', label: reportOptions.find((r) => r[0] === report)?.[1] || 'Группа' },
    { key: 'visits', label: 'Визиты' },
    { key: 'visitors', label: 'Посетители' },
    { key: 'pageviews', label: 'Просмотры' },
    { key: 'active_seconds', label: 'Время', render: secs },
    { key: 'conversion_rate', label: 'Конверсия', render: (n) => fmt(n) + '%' },
  ]
  if (report === 'events')
    columns = [
      { key: 'label', label: 'Имя события' },
      { key: 'events', label: 'События' },
      { key: 'visits', label: 'Визиты' },
    ]
  if (report === 'pages') columns = columns.slice(0, 4)
  if (report === 'performance')
    columns = [
      { key: 'label', label: 'Страница' },
      { key: 'samples', label: 'Измерений' },
      { key: 'load_ms', label: 'Загрузка, мс' },
      { key: 'lcp_ms', label: 'LCP, мс' },
      { key: 'cls', label: 'CLS' },
    ]
  if (report === 'errors')
    columns = [
      { key: 'label', label: 'Ошибка' },
      { key: 'path', label: 'Страница' },
      { key: 'errors', label: 'Ошибки' },
      { key: 'visits', label: 'Визиты' },
    ]
  if (report === 'retention')
    columns = [
      { key: 'label', label: 'Когорта (понедельник)' },
      { key: 'users', label: 'Новые посетители' },
      ...Array.from({ length: 9 }, (_, i) => ({ key: 'w' + i, label: 'Неделя ' + i })),
    ]
  return (
    <section className="card">
      <div className="reportToolbar">
        <select aria-label="Вид отчёта" value={report} onChange={(e) => setReport(e.target.value)}>
          {reportOptions.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <a
          className="button"
          href={'/api' + base + '/reports/' + report + query + '&format=csv'}
          download
        >
          <Download size={16} />
          CSV
        </a>
      </div>
      {report === 'countries' && (
        <p className="notice">
          География требует источника GeoIP. Без него страна отображается как «Не определено».
        </p>
      )}
      {error ? (
        <p className="error">{error}</p>
      ) : loading ? (
        <div className="loading">Загрузка отчёта…</div>
      ) : (
        <Table rows={data} columns={columns} />
      )}
    </section>
  )
}
function Visits({ base, query, version, select, replay }) {
  const { data, error } = useData(base + '/visits' + query, version),
    [search, setSearch] = useState('')
  return (
    <section className="card">
      <div className="cardHeading">
        <div>
          <h2>{replay ? 'Записанные визиты' : 'Лента визитов'}</h2>
          <p>Последние 250 визитов выбранного сегмента</p>
        </div>
        <label className="search">
          <Search size={16} />
          <input
            aria-label="Поиск визитов"
            placeholder="Источник или страница"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      {error ? (
        <p className="error">{error}</p>
      ) : (
        <Table
          rows={data?.filter((v) =>
            (v.source + ' ' + v.entry + ' ' + v.visitor)
              .toLowerCase()
              .includes(search.toLowerCase()),
          )}
          onRow={select}
          columns={[
            { key: 'started', label: 'Начало визита', render: date },
            { key: 'source', label: 'Источник' },
            { key: 'entry', label: 'Вход' },
            { key: 'device', label: 'Устройство' },
            { key: 'pageviews', label: 'Просмотры' },
            { key: 'active_seconds', label: 'Активное время', render: secs },
            { key: 'goals', label: 'Цели' },
            {
              key: 'has_replay',
              label: 'Запись',
              render: (v) =>
                v ? (
                  <span className="playBadge">
                    <Play size={13} />
                    Смотреть
                  </span>
                ) : (
                  '—'
                ),
            },
          ]}
        />
      )}
    </section>
  )
}
function Replay({ events }) {
  const ref = useRef()
  const [error, setError] = useState('')
  useEffect(() => {
    if (!ref.current || events.length < 2) return
    let player,
      alive = true
    import('rrweb-player')
      .then(({ default: Player }) => {
        if (!alive) return
        player = new Player({
          target: ref.current,
          props: {
            events,
            autoPlay: false,
            width: Math.min(950, ref.current.clientWidth || 950),
            height: 500,
            skipInactive: true,
            showController: true,
          },
        })
      })
      .catch((e) => alive && setError('Не удалось открыть запись: ' + e.message))
    return () => {
      alive = false
      player?.$destroy()
    }
  }, [events])
  return (
    <>
      {error && <p className="error">{error}</p>}
      <div className="replayMount" ref={ref} />
    </>
  )
}
function VisitDetail({ base, visit, close }) {
  const detail = useData(base + '/visits/' + visit.id),
    recording = useData(visit.has_replay ? base + '/visits/' + visit.id + '/replay' : null)
  return (
    <Modal title={'Визит · ' + date(visit.started)} close={close} wide>
      <div className="visitMeta">
        <span>{visit.source}</span>
        <span>
          {visit.device} · {visit.browser}
        </span>
        <span>{visit.pageviews} просмотров</span>
        <span>{secs(visit.active_seconds)} активного времени</span>
      </div>
      {recording.error && <p className="error">{recording.error}</p>}
      {recording.data?.length > 1 ? (
        <Replay events={recording.data} />
      ) : visit.has_replay ? (
        <p className="notice">Загружаем запись…</p>
      ) : (
        <p className="notice">
          У этого визита нет записи экрана. Включите запись в настройках счётчика и атрибут
          data-replay в коде.
        </p>
      )}
      <h3>Путь посетителя</h3>
      <div className="eventTimeline">
        {detail.data?.events
          .filter((e) => e.type !== 'heartbeat' && e.type !== 'scroll')
          .map((e) => (
            <div key={e.id}>
              <time>{new Date(e.ts).toLocaleTimeString('ru-RU')}</time>
              <span className="badge">{e.type}</span>
              <b>{e.name || e.path}</b>
            </div>
          ))}
      </div>
    </Modal>
  )
}
function Goals({ base, query, version, add, remove, editable }) {
  const { data } = useData(base + '/goals' + query, version)
  return (
    <section className="card">
      <div className="cardHeading">
        <div>
          <h2>Целевые действия</h2>
          <p>Уникальные визиты с достижением цели / все визиты сегмента</p>
        </div>
        {editable && (
          <button className="yellow" onClick={add}>
            <Plus size={16} />
            Добавить цель
          </button>
        )}
      </div>
      <Table
        rows={data}
        columns={[
          { key: 'name', label: 'Цель' },
          {
            key: 'kind',
            label: 'Условие',
            render: (v, r) => (
              <code>
                {v === 'page' ? 'page:' : 'event:'}
                {r.value}
              </code>
            ),
          },
          { key: 'completions', label: 'Достижения' },
          { key: 'visits', label: 'Целевые визиты' },
          { key: 'conversion_rate', label: 'Конверсия', render: (n) => <b>{fmt(n)}%</b> },
          ...(editable
            ? [
                {
                  key: 'id',
                  label: '',
                  render: (id) => (
                    <button className="icon" aria-label="Удалить цель" onClick={() => remove(id)}>
                      <Trash2 size={16} />
                    </button>
                  ),
                },
              ]
            : []),
        ]}
      />
      <p className="notice">
        Автоматические события счётчика: <code>form_submit</code>, <code>click_phone</code>,{' '}
        <code>click_email</code>. Свою цель можно вызвать через{' '}
        <code>om('event', 'lead_sent')</code>.
      </p>
    </section>
  )
}
function Funnels({ base, query, version, add, remove, editable }) {
  const { data } = useData(base + '/funnels' + query, version)
  return (
    <>
      <div className="sectionActions">
        <p className="muted">Последовательность действий внутри одного визита</p>
        {editable && (
          <button className="yellow" onClick={add}>
            <Plus size={16} />
            Новая воронка
          </button>
        )}
      </div>
      {!data?.length && (
        <section className="card">
          <Empty
            title="Создайте воронку"
            text="Например: главная → тарифы → отправленная заявка. Увидите, на каком шаге уходят посетители."
          />
        </section>
      )}
      {data?.map((f) => (
        <section className="card" key={f.id}>
          <div className="cardHeading">
            <h2>{f.name}</h2>
            {editable && (
              <button className="icon" aria-label="Удалить воронку" onClick={() => remove(f.id)}>
                <Trash2 size={16} />
              </button>
            )}
          </div>
          <div className="funnelSteps">
            {f.steps.map((s, i) => (
              <div key={i}>
                <small>ШАГ {i + 1}</small>
                <b>{s.value}</b>
                <strong>{fmt(s.count)}</strong>
                <div className="funnelBar">
                  <i
                    style={{ height: `${Math.max(8, (s.count / (f.steps[0].count || 1)) * 100)}%` }}
                  />
                </div>
                <span>{i ? fmt(s.conversion) + '% с прошлого шага' : '100% входов'}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  )
}
function Maps({ base, query, version }) {
  const { data } = useData(base + '/behavior' + query, version),
    [tab, setTab] = useState('clicks'),
    [overlay, setOverlay] = useState(true)
  const snapshot = useData(tab === 'clicks' ? base + '/map-snapshot' + query : null, version)
  return (
    <section className="card">
      <div className="tabs">
        {[
          ['clicks', 'Клики'],
          ['scroll', 'Скроллинг'],
          ['links', 'Ссылки'],
          ['forms', 'Формы'],
        ].map(([id, label]) => (
          <button className={tab === id ? 'active' : ''} key={id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {data?.truncated && (
        <p className="notice">Показаны первые 50 000 событий. Сузьте период или сегмент.</p>
      )}
      {tab === 'clicks' && (
        <>
          <div className="cardHeading">
            <div>
              <h2>Карта кликов</h2>
              <p>
                Нормализованные координаты по ширине и высоте документа. Для одной страницы задайте
                сегмент «Страница».
              </p>
            </div>
            <span className="badge">{fmt(data?.clicks.length)} кликов</span>
          </div>
          {snapshot.data?.events.length > 0 && (
            <div className="mapMode">
              <button className="button" onClick={() => setOverlay(!overlay)}>
                {overlay ? 'Показать сетку координат' : 'Показать снимок страницы'}
              </button>
            </div>
          )}
          {snapshot.data?.events.length > 0 && data?.clicks.length && overlay ? (
            <React.Suspense fallback={<div className="loading">Восстанавливаем снимок…</div>}>
              <MapOverlay snapshot={snapshot.data} clicks={data.clicks} />
            </React.Suspense>
          ) : data?.clicks.length ? (
            <div className="heatmap">
              <div className="heatLegend">
                Верх страницы
                <span>
                  Плотность кликов <i />
                </span>
              </div>
              <svg viewBox="0 0 1000 600" role="img" aria-label="Распределение кликов на странице">
                <defs>
                  <radialGradient id="heat">
                    <stop stopColor="#e6391e" stopOpacity=".7" />
                    <stop offset=".35" stopColor="#ffaa00" stopOpacity=".5" />
                    <stop offset="1" stopColor="#ffe066" stopOpacity="0" />
                  </radialGradient>
                  <pattern id="grid" width="100" height="60" patternUnits="userSpaceOnUse">
                    <path d="M 100 0 L 0 0 0 60" fill="none" stroke="#e1e5eb" strokeWidth="1" />
                  </pattern>
                </defs>
                <rect width="1000" height="600" fill="url(#grid)" />
                {data.clicks.slice(0, 10000).map((c, i) => (
                  <circle
                    key={i}
                    cx={Math.min(1000, (c.x / (c.width || 1)) * 1000)}
                    cy={Math.min(600, (c.y / (c.height || 1)) * 600)}
                    r="22"
                    fill="url(#heat)"
                  >
                    <title>
                      {c.path} · {c.selector}
                    </title>
                  </circle>
                ))}
              </svg>
              <div className="heatLegend">
                Низ страницы<span>По всем разрешениям выбранного сегмента</span>
              </div>
            </div>
          ) : (
            <Empty />
          )}
        </>
      )}
      {tab === 'scroll' && (
        <div className="scrollMap">
          <h2>До какой глубины доходят посетители</h2>
          {data?.scroll.map((s) => (
            <div key={s.depth}>
              <b>{s.depth}% страницы</b>
              <span
                style={{
                  background: `linear-gradient(90deg,#ffe16b ${s.percent}%,#f2f3f6 ${s.percent}%)`,
                }}
              >
                {fmt(s.visits)} визитов
              </span>
              <strong>{fmt(s.percent)}%</strong>
            </div>
          ))}
          <p className="hint">В расчёт входят визиты с зафиксированной глубиной скролла.</p>
        </div>
      )}
      {tab === 'links' && (
        <Table
          rows={data?.links}
          columns={[
            { key: 'label', label: 'Страница → ссылка' },
            { key: 'clicks', label: 'Клики' },
          ]}
        />
      )}
      {tab === 'forms' && (
        <>
          <Table
            rows={data?.forms}
            columns={[
              { key: 'form', label: 'Форма' },
              { key: 'path', label: 'Страница' },
              { key: 'starts', label: 'Начали' },
              { key: 'submits', label: 'Отправили' },
              { key: 'conversion', label: 'Конверсия', render: (n) => fmt(n) + '%' },
            ]}
          />
          <p className="notice">
            Счётчик фиксирует события submit, а не успешный ответ сервера. Для подтверждённой заявки
            используйте собственную цель.
          </p>
        </>
      )}
    </section>
  )
}
function Commerce({ base, query, version }) {
  const { data, error } = useData(base + '/ecommerce' + query, version)
  return (
    <>
      <div className="metrics commerceMetrics">
        {data?.totals.map((t) => (
          <article className="metric" key={t.currency}>
            <span>Выручка, {t.currency}</span>
            <strong>{fmt(t.revenue)}</strong>
            <small>{fmt(t.orders)} заказов</small>
          </article>
        ))}
      </div>
      <section className="card">
        <div className="cardHeading">
          <h2>Покупки</h2>
          <span className="muted">Последние 5 000 заказов</span>
        </div>
        {error && <p className="error">{error}</p>}
        <Table
          rows={data?.orders}
          columns={[
            { key: 'order_id', label: 'Заказ' },
            { key: 'ts', label: 'Дата', render: date },
            { key: 'revenue', label: 'Выручка' },
            { key: 'currency', label: 'Валюта' },
            {
              key: 'items',
              label: 'Товары',
              render: (items) => items.map((i) => `${i.name || i.id} × ${i.quantity}`).join(', '),
            },
          ]}
        />
        <p className="notice">
          Отправляйте покупку через om('ecommerce', ...). Заказы с одинаковым ID не дублируются.
        </p>
      </section>
      <section className="card">
        <div className="cardHeading">
          <h2>Товары</h2>
        </div>
        <Table
          rows={data?.products}
          columns={[
            { key: 'name', label: 'Товар' },
            { key: 'id', label: 'Артикул' },
            { key: 'quantity', label: 'Продано' },
            { key: 'revenue', label: 'Выручка по позициям' },
            { key: 'currency', label: 'Валюта' },
          ]}
        />
      </section>
    </>
  )
}
function Acquisition({ base, query, version, mutate, notify, editable }) {
  const { data, error } = useData(base + '/acquisition' + query, version)
  const importFile = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      if (file.size > 2000000) throw Error('Файл должен быть меньше 2 МБ')
      const { parseCsv } = await import('../server/csv.js')
      const rows = parseCsv(await file.text())
      await mutate('/costs', 'POST', { rows })
      notify(`Импортировано строк: ${rows.length}`)
    } catch (e) {
      notify(e.message)
    }
    event.target.value = ''
  }
  return (
    <>
      <section className="card">
        <div className="cardHeading">
          <div>
            <h2>Расходы и выручка по источникам</h2>
            <p>Доходы из ecommerce. Расходы — из вашего импорта. Валюты считаются отдельно.</p>
          </div>
        </div>
        {error ? (
          <p className="error">{error}</p>
        ) : (
          <Table
            rows={data}
            columns={[
              { key: 'source', label: 'Источник' },
              { key: 'campaign', label: 'Кампания' },
              { key: 'visits', label: 'Визиты' },
              { key: 'cost', label: 'Расходы' },
              { key: 'revenue', label: 'Выручка' },
              { key: 'orders', label: 'Заказы' },
              { key: 'roas', label: 'ROAS', render: (n) => (n === null ? '—' : fmt(n) + '×') },
              { key: 'cpa', label: 'Стоимость заказа', render: (n) => (n === null ? '—' : fmt(n)) },
              { key: 'currency', label: 'Валюта' },
            ]}
          />
        )}
        <p className="notice">
          ROAS = выручка / расходы. Источник и кампания сопоставляются с UTM визита. Данные Директа
          и других рекламных систем автоматически не загружаются.
        </p>
      </section>
      <section className="card">
        <div className="settingsBody">
          <h2>Добавить расходы</h2>
          <form
            className="stackForm"
            onSubmit={async (e) => {
              e.preventDefault()
              const form = e.currentTarget
              const row = Object.fromEntries(new FormData(form))
              await mutate('/costs', 'POST', { rows: [row] })
                .then(() => notify('Расходы сохранены'))
                .catch(() => {})
            }}
          >
            <Field
              label="Дата (UTC)"
              type="date"
              name="day"
              defaultValue={new Date().toISOString().slice(0, 10)}
              required
            />
            <Field
              label="Источник: точно как utm_source"
              name="source"
              placeholder="yandex"
              required
            />
            <Field label="Кампания: точно как utm_campaign" name="campaign" />
            <Field label="Сумма" name="amount" type="number" step="0.01" min="0" required />
            <Field label="Валюта" name="currency" defaultValue="RUB" pattern="[A-Z]{3}" required />
            <button className="yellow" disabled={!editable}>
              Сохранить расходы
            </button>
          </form>
          <h3 style={{ marginTop: 30 }}>Импорт CSV</h3>
          <p className="hint">
            Заголовки: day,source,campaign,currency,amount. Повторный импорт той же даты, источника,
            кампании и валюты заменяет сумму.
          </p>
          <input
            aria-label="CSV расходов"
            type="file"
            accept=".csv,text/csv"
            disabled={!editable}
            onChange={importFile}
          />
        </div>
      </section>
    </>
  )
}
function SettingsPage({ site, base, version, mutate, notify, readOnly }) {
  const [tab, setTab] = useState('code'),
    [token, setToken] = useState(''),
    [copied, setCopied] = useState(false)
  const members = useData(site.role === 'owner' ? base + '/members' : null, version),
    keys = useData(site.role === 'owner' ? base + '/keys' : null, version)
  const owner = site.role === 'owner' && !readOnly,
    snippet = `<script defer src="${location.origin}/om.js" data-site="${site.id}"${site.replay ? ' data-replay="true"' : ''}></script>`
  return (
    <section className="card">
      <div className="tabs">
        {[
          ['code', 'Код счётчика'],
          ['general', 'Основное'],
          ['access', 'Доступ'],
          ['api', 'API'],
          ['privacy', 'Хранение данных'],
        ].map(([id, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'code' && (
        <div className="settingsBody">
          <h2>Подключение к сайту</h2>
          <p className="muted">
            Разместите код перед закрывающим тегом &lt;/head&gt; на всех страницах сайта.
          </p>
          <pre>
            <code>{snippet}</code>
          </pre>
          <button
            className="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(snippet)
                setCopied(true)
                setTimeout(() => setCopied(false), 2500)
              } catch {
                notify('Выделите и скопируйте код вручную')
              }
            }}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}Скопировать
          </button>
          <div className="instructions">
            <h3>JavaScript-цель</h3>
            <pre>
              <code>om('event', 'lead_sent')</code>
            </pre>
            <h3>Приватность и согласие</h3>
            <p>
              Поля ввода в записях маскируются. Добавьте <code>class="om-block"</code> или{' '}
              <code>data-om-private</code> к приватному блоку. Класс <code>om-mask</code> скрывает
              текст.
            </p>
            <p>
              Для запуска только после согласия добавьте <code>data-consent="required"</code> в тег
              и вызовите <code>om('consent', true)</code>. Отзыв: <code>om('consent', false)</code>.
              DNT и GPC учитываются автоматически.
            </p>
          </div>
        </div>
      )}
      {tab === 'general' && (
        <form
          className="settingsBody"
          key={site.id + version}
          onSubmit={async (e) => {
            e.preventDefault()
            const f = Object.fromEntries(new FormData(e.currentTarget))
            await mutate('', 'PATCH', {
              name: f.name,
              domains: f.domains.split(',').map((s) => s.trim()),
              replay: f.replay === 'on',
            })
              .then(() => notify('Настройки сохранены'))
              .catch(() => {})
          }}
        >
          <Field label="Название" name="name" defaultValue={site.name} required />
          <Field
            label="Разрешённые домены через запятую"
            name="domains"
            defaultValue={site.domains.join(', ')}
            required
          />
          <label className="check">
            <input type="checkbox" name="replay" defaultChecked={site.replay} />
            Разрешить записи сессий
          </label>
          <p className="hint">
            После включения записей обновите код на сайте: нужен атрибут data-replay="true".
          </p>
          <button className="yellow" disabled={!owner}>
            Сохранить
          </button>
        </form>
      )}
      {tab === 'access' && (
        <div className="settingsBody">
          <h2>Доступ к счётчику</h2>
          {site.role !== 'owner' ? (
            <p>Ваш уровень доступа: {site.role}. Доступами управляет владелец.</p>
          ) : (
            <>
              <Table
                rows={members.data}
                columns={[
                  { key: 'name', label: 'Имя' },
                  { key: 'email', label: 'Email' },
                  { key: 'role', label: 'Роль' },
                  {
                    key: 'id',
                    label: '',
                    render: (id) => (
                      <button
                        className="icon"
                        disabled={!owner}
                        aria-label="Отозвать доступ"
                        onClick={() => mutate('/members/' + id, 'DELETE').catch(() => {})}
                      >
                        <Trash2 size={15} />
                      </button>
                    ),
                  },
                ]}
              />
              <form
                className="stackForm"
                onSubmit={async (e) => {
                  e.preventDefault()
                  const form = e.currentTarget
                  await mutate('/members', 'POST', Object.fromEntries(new FormData(form)))
                    .then(() => {
                      form.reset()
                      notify('Доступ добавлен')
                    })
                    .catch(() => {})
                }}
              >
                <h3>Добавить сотрудника</h3>
                <Field label="Email" name="email" type="email" required />
                <Field label="Имя (для нового пользователя)" name="name" />
                <Field
                  label="Пароль нового пользователя, от 12 символов"
                  name="password"
                  type="password"
                  minLength="12"
                  autoComplete="new-password"
                />
                <Field label="Роль">
                  <select name="role">
                    <option value="viewer">Просмотр</option>
                    <option value="editor">Редактор целей и воронок</option>
                  </select>
                </Field>
                <button className="yellow" disabled={!owner}>
                  Предоставить доступ
                </button>
              </form>
            </>
          )}
        </div>
      )}
      {tab === 'api' && (
        <div className="settingsBody">
          <h2>Ключи API только для чтения</h2>
          <p className="muted">
            Ключ предоставляет отчёты этого счётчика. Передавайте его в заголовке Authorization:
            Bearer.
          </p>
          {token && (
            <div className="notice">
              <b>Сохраните ключ — повторно он не показывается.</b>
              <pre>{token}</pre>
            </div>
          )}
          <Table
            rows={keys.data}
            columns={[
              { key: 'name', label: 'Ключ' },
              { key: 'created_at', label: 'Создан', render: date },
              {
                key: 'id',
                label: '',
                render: (id) => (
                  <button
                    className="icon"
                    disabled={!owner}
                    aria-label="Отозвать ключ"
                    onClick={() => mutate('/keys/' + id, 'DELETE').catch(() => {})}
                  >
                    <Trash2 size={15} />
                  </button>
                ),
              },
            ]}
          />
          <form
            className="inlineForm"
            onSubmit={async (e) => {
              e.preventDefault()
              const f = Object.fromEntries(new FormData(e.currentTarget))
              const result = await mutate('/keys', 'POST', f).catch(() => null)
              if (result) setToken(result.token)
            }}
          >
            <input
              aria-label="Название ключа"
              name="name"
              placeholder="Например, BI-панель"
              required
            />
            <button className="yellow" disabled={!owner}>
              Создать ключ
            </button>
          </form>
          <pre>GET /api{base}/overview?days=30</pre>
        </div>
      )}
      {tab === 'privacy' && (
        <div className="settingsBody">
          <h2>Срок хранения и очистка</h2>
          <p>
            По умолчанию визиты хранятся 180 дней, записи — 30 дней. Автоматические сроки задаются
            переменными RETENTION_DAYS и REPLAY_RETENTION_DAYS на сервере.
          </p>
          <form
            className="stackForm"
            onSubmit={async (e) => {
              e.preventDefault()
              const f = Object.fromEntries(new FormData(e.currentTarget))
              if (
                !confirm(
                  'Удалить данные старше указанного срока? Восстановление возможно только из резервной копии.',
                )
              )
                return
              const r = await mutate('/cleanup', 'POST', f).catch(() => null)
              if (r) notify(`Удалено визитов: ${r.deleted}, фрагментов записи: ${r.recordings}`)
            }}
          >
            <Field
              label="Сохранить визиты за последние N дней"
              type="number"
              name="days"
              defaultValue="180"
              min="1"
              max="3650"
            />
            <Field
              label="Сохранить записи за последние N дней"
              type="number"
              name="replayDays"
              defaultValue="30"
              min="1"
              max="3650"
            />
            <button className="button danger" disabled={!owner}>
              Очистить старые данные
            </button>
          </form>
        </div>
      )}
    </section>
  )
}

createRoot(document.getElementById('root')).render(<App />)
