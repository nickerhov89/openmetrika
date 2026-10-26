import React, { useState, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import Business from './Business.jsx'
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
let reportTimezone = 'UTC'
const date = (n) =>
  new Date(n).toLocaleString('ru-RU', {
    timeZone: reportTimezone,
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
    set((s) => ({ data: s.path === path ? s.data : null, loading: true, error: '', path }))
    const load = () =>
      path &&
      api(path)
        .then((data) => alive && set({ data, error: '', loading: false, path }))
        .catch((e) => alive && set({ data: null, error: e.message, loading: false, path }))
    if (path) load()
    else set({ data: null, error: '', loading: false, path })
    const timer = path?.includes('/overview') ? setInterval(load, 30000) : null
    return () => {
      alive = false
      if (timer) clearInterval(timer)
    }
  }, [path, version])
  return state.path === path ? state : { data: null, error: '', loading: !!path }
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
  ['business', 'Лиды и прибыль', Goal],
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
                if (onRow && e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
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
    [siteId, setSiteId] = useState(
      new URLSearchParams(location.search).get('site') || localStorage.getItem('om_site') || '',
    ),
    [view, setView] = useState(location.hash.slice(1) || 'overview'),
    [modal, setModal] = useState(null),
    [toast, setToast] = useState(''),
    [mobile, setMobile] = useState(false),
    [compact, setCompact] = useState(() => matchMedia('(max-width:760px)').matches)
  const [filters, setFilters] = useState(() => ({
      days: '30',
      ...Object.fromEntries(
        [...new URLSearchParams(location.search)].filter(([k]) =>
          [
            'days',
            'from',
            'to',
            'source',
            'medium',
            'browser',
            'os',
            'country',
            'attribution',
            'attributionDays',
            'businessBasis',
            'displayCurrency',
            'campaign',
            'device',
            'path',
            'pathOp',
            'goal',
            'converted',
            'replay',
            'compareFrom',
            'compareTo',
            'conditions',
          ].includes(k),
        ),
      ),
    })),
    [showFilters, setShowFilters] = useState(false),
    [report, setReport] = useState(new URLSearchParams(location.search).get('report') || 'sources'),
    [selectedVisit, setSelectedVisit] = useState(null),
    [editFunnel, setEditFunnel] = useState(null),
    [editSaved, setEditSaved] = useState(null)
  useEffect(() => {
    const media = matchMedia('(max-width:760px)'),
      update = () => setCompact(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (!mobile) return
    const escape = (e) => {
      if (e.key === 'Escape') setMobile(false)
    }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [mobile])
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
    saved = useData(base ? base + '/saved' : null, version),
    goals = useData(base ? base + '/goals?days=366' : null, version),
    options = useData(base ? base + '/options' : null, version)
  useEffect(() => {
    history.replaceState(
      null,
      '',
      '?' +
        new URLSearchParams({
          ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
          report,
          ...(site?.id ? { site: site.id } : {}),
        }).toString() +
        '#' +
        view,
    )
  }, [q, report, view, site?.id])
  const go = (id, kind, segment) => {
    if (segment) setFilters((f) => ({ ...f, ...segment }))
    if (kind) setReport(kind)
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
  reportTimezone = site?.timezone || 'UTC'
  if (authError) return <Empty title="Не удалось подключиться" text={authError} />
  if (!session) return <div className="loading">Загружаем OpenMetrika…</div>
  if (!session.user) return <Auth setup={session.setup} onDone={reload} />
  if (sites.loading && !sites.data) return <div className="loading">Загружаем счётчики…</div>
  const change = (key, value) => setFilters((f) => ({ ...f, [key]: value }))
  return (
    <div className="shell">
      {compact && mobile && (
        <button
          className="menuBackdrop"
          aria-label="Закрыть навигацию"
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        className={mobile ? 'sidebar open' : 'sidebar'}
        inert={compact && !mobile}
        aria-hidden={compact && !mobile ? true : undefined}
      >
        {compact && mobile && (
          <button
            className="icon menuClose"
            aria-label="Закрыть меню"
            onClick={() => setMobile(false)}
          >
            <X size={20} />
          </button>
        )}
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
      <main className="workspace" inert={compact && mobile}>
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
              <button
                className="button"
                onClick={() => {
                  setEditSaved(null)
                  setModal('save')
                }}
                disabled={!site}
              >
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
                <select
                  aria-label="Цель для анализа"
                  value={filters.goal || site.primary_goal || 'any'}
                  onChange={(e) => change('goal', e.target.value)}
                >
                  <option value="any">Любая цель</option>
                  {goals.data?.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                      {site.primary_goal === g.id ? ' · основная' : ''}
                    </option>
                  ))}
                </select>
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
                      list="source-options"
                      value={filters.source || ''}
                      onChange={(e) => change('source', e.target.value)}
                    />
                  </Field>
                  <datalist id="source-options">
                    {options.data?.sources.map((v) => (
                      <option value={v} key={v} />
                    ))}
                  </datalist>
                  <datalist id="campaign-options">
                    {options.data?.campaigns.map((v) => (
                      <option value={v} key={v} />
                    ))}
                  </datalist>
                  <datalist id="page-options">
                    {options.data?.pages.map((v) => (
                      <option value={v} key={v} />
                    ))}
                  </datalist>
                  <Field label="UTM-кампания">
                    <input
                      list="campaign-options"
                      value={filters.campaign || ''}
                      onChange={(e) => change('campaign', e.target.value)}
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
                      list="page-options"
                      value={filters.path || ''}
                      onChange={(e) => change('path', e.target.value)}
                    />
                  </Field>
                  <Field label="Условие страницы">
                    <select
                      value={filters.pathOp || 'exact'}
                      onChange={(e) => change('pathOp', e.target.value)}
                    >
                      <option value="exact">Посещали точный путь</option>
                      <option value="contains">Путь содержит</option>
                      <option value="exclude">Не посещали путь</option>
                    </select>
                  </Field>
                  <Field label="Сравнить с: начало">
                    <input
                      type="date"
                      value={filters.compareFrom || ''}
                      onChange={(e) => change('compareFrom', e.target.value)}
                    />
                  </Field>
                  <Field label="Сравнить с: конец">
                    <input
                      type="date"
                      value={filters.compareTo || ''}
                      onChange={(e) => change('compareTo', e.target.value)}
                    />
                  </Field>
                  <SegmentRules
                    value={filters.conditions || ''}
                    onChange={(value) => change('conditions', value)}
                  />
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
                        aria-label={'Обновить ' + s.name}
                        onClick={() => {
                          setEditSaved(s)
                          setModal('save')
                        }}
                      >
                        ✎
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
              {['business', 'acquisition'].includes(view) &&
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
                ].some((k) => filters[k]) && (
                  <p className="notice">
                    В этом разделе применяются период, источник и кампания.{' '}
                    <button
                      className="textButton"
                      onClick={() =>
                        setFilters((f) =>
                          Object.fromEntries(
                            Object.entries(f).filter(([k]) =>
                              ['days', 'from', 'to', 'source', 'campaign'].includes(k),
                            ),
                          ),
                        )
                      }
                    >
                      Сбросить условия визитов
                    </button>
                  </p>
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
                  drill={(row) => {
                    const key = {
                      sources: 'source',
                      campaigns: 'campaign',
                      pages: 'path',
                      entry: 'path',
                      exit: 'path',
                      devices: 'device',
                      browsers: 'browser',
                      os: 'os',
                      countries: 'country',
                    }[report]
                    if (key) {
                      setFilters((f) => ({ ...f, [key]: row[key] || row.label }))
                      go('overview')
                      setShowFilters(true)
                    }
                  }}
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
                  add={() => {
                    setEditFunnel(null)
                    setModal('funnel')
                  }}
                  edit={(f) => {
                    setEditFunnel(f)
                    setModal('funnel')
                  }}
                  select={(v) => setSelectedVisit({ id: v })}
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
              {view === 'business' && (
                <Business
                  base={base}
                  query={query}
                  configure={(patch) => setFilters((f) => ({ ...f, ...patch }))}
                  version={version}
                  useData={useData}
                  Table={Table}
                  api={api}
                  notify={notify}
                  reload={reload}
                  editable={site.role === 'owner' && !session.readOnly}
                  select={(v) => setSelectedVisit({ id: v })}
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
            <span>OpenMetrika · Открытая аналитика · Время отчётов: {site?.timezone || 'UTC'}</span>
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
                  await mutate(
                    editSaved ? '/saved/' + editSaved.id : '/saved',
                    editSaved ? 'PATCH' : 'POST',
                    {
                      name: f.name,
                      config: { view, filters, report },
                    },
                  )
                if (modal === 'funnel')
                  await mutate(
                    editFunnel ? '/funnels/' + editFunnel.id : '/funnels',
                    editFunnel ? 'PATCH' : 'POST',
                    {
                      name: f.name,
                      steps: JSON.parse(f.steps),
                      scope: f.scope,
                      window_days: Number(f.window_days),
                    },
                  )
                setModal(null)
                reload()
              } catch (e) {
                notify(e.message)
              }
            }}
          >
            <Field
              label="Название"
              name="name"
              required
              defaultValue={
                modal === 'funnel'
                  ? editFunnel?.name
                  : modal === 'save'
                    ? editSaved?.name
                    : undefined
              }
            />
            {modal === 'save' && (
              <p className="hint">
                Сохраняются текущие открытые раздел, период и условия. При обновлении они заменят
                предыдущую конфигурацию отчёта.
              </p>
            )}
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
            {modal === 'funnel' && <FunnelFields initial={editFunnel} options={options.data} />}
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
    pages = useData(base + '/reports/pages' + query, version),
    signals = useData(base + '/insights' + query, version)
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
      <div className="sectionActions">
        <p className="hint">
          Конверсия — доля визитов с выбранной целью. Сравнение:{' '}
          {new Date(data.previousPeriod.from).toLocaleDateString('ru-RU', {
            timeZone: reportTimezone,
          })}{' '}
          —{' '}
          {new Date(data.previousPeriod.to).toLocaleDateString('ru-RU', {
            timeZone: reportTimezone,
          })}
          .
        </p>
        <button className="button" onClick={() => go('visits')}>
          Визиты сегмента
        </button>
        <button className="button" onClick={() => go('replay')}>
          Записи сегмента
        </button>
      </div>
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
      <section className="card">
        <div className="cardHeading">
          <div>
            <h2>Что проверить</h2>
            <p>{signals.data?.note || 'Ищем заметные изменения по источникам'}</p>
          </div>
        </div>
        {signals.data?.signals.length ? (
          signals.data.signals.map((s) => (
            <p key={s.source + '|' + s.medium}>
              <b>
                {s.source}: конверсия {s.previous}% → {s.current}% ({s.change_pp > 0 ? '+' : ''}
                {s.change_pp} п.п.)
              </b>{' '}
              · {s.visits} визитов сейчас, {s.previous_visits} ранее.{' '}
              <button
                className="textButton"
                onClick={() => go('reports', 'sources', { source: s.source, medium: s.medium })}
              >
                Исследовать источники ↗
              </button>
            </p>
          ))
        ) : (
          <p className="hint">
            {signals.loading
              ? 'Сравниваем…'
              : 'Сигналов по выбранным условиям нет. Нужно минимум 100 визитов в каждом периоде, 10 суммарных целевых визитов и заметное изменение конверсии.'}
          </p>
        )}
        {signals.error && <p className="error">{signals.error}</p>}
      </section>
      <div className="twoColumns">
        <section className="card">
          <div className="cardHeading">
            <h2>Источники трафика</h2>
            <button className="textButton" onClick={() => go('reports', 'sources')}>
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
            <button className="textButton" onClick={() => go('reports', 'pages')}>
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
function Reports({ base, query, version, report, setReport, drill }) {
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
        <Table
          rows={data}
          columns={columns}
          onRow={
            [
              'sources',
              'campaigns',
              'pages',
              'entry',
              'exit',
              'devices',
              'browsers',
              'os',
              'countries',
            ].includes(report)
              ? drill
              : undefined
          }
        />
      )}
    </section>
  )
}
function Visits({ base, query, version, select, replay }) {
  const [search, setSearch] = useState('')
  const { data, error, loading } = useData(
    base + '/visits' + query + '&search=' + encodeURIComponent(search),
    version,
  )
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
      {loading ? (
        <div className="loading">Загружаем визиты…</div>
      ) : error ? (
        <p className="error">{error}</p>
      ) : (
        <Table
          rows={data}
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
function VisitDetail({ base, visit: initial, close }) {
  const detail = useData(base + '/visits/' + initial.id),
    recording = useData(base + '/visits/' + initial.id + '/replay'),
    visit = detail.data?.visit || initial
  return (
    <Modal
      title={'Визит · ' + (visit.started ? date(visit.started) : 'Загрузка…')}
      close={close}
      wide
    >
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
              <time>
                {new Date(e.ts).toLocaleTimeString('ru-RU', { timeZone: reportTimezone })}
              </time>
              <span className="badge">{e.type}</span>
              <b>{e.name || e.path}</b>
            </div>
          ))}
      </div>
    </Modal>
  )
}
function Goals({ base, query, version, add, remove, editable }) {
  const { data, loading, error } = useData(base + '/goals' + query, version)
  if (loading) return <div className="loading">Загружаем цели…</div>
  if (error) return <p className="error">{error}</p>
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
function SegmentRules({ value, onChange }) {
  const parse = (value) => {
    try {
      return value ? JSON.parse(value) : { mode: 'all', rules: [] }
    } catch {
      return { mode: 'all', rules: [] }
    }
  }
  const [draft, setDraft] = useState(() => parse(value))
  useEffect(() => setDraft(parse(value)), [value])
  const update = (i, patch) =>
    setDraft((c) => ({ ...c, rules: c.rules.map((r, n) => (n === i ? { ...r, ...patch } : r)) }))
  return (
    <details className="advancedSegment">
      <summary>Дополнительные условия · {draft.rules.length}</summary>
      <label>
        Совпадение{' '}
        <select
          aria-label="Логика сегмента"
          value={draft.mode}
          onChange={(e) => setDraft((c) => ({ ...c, mode: e.target.value }))}
        >
          <option value="all">Все условия (И)</option>
          <option value="any">Любое условие (ИЛИ)</option>
        </select>
      </label>
      {draft.rules.map((r, i) => (
        <div className="segmentRule" key={i}>
          <select
            aria-label={`Поле условия ${i + 1}`}
            value={r.field}
            onChange={(e) => update(i, { field: e.target.value })}
          >
            {Object.entries({
              source: 'Источник',
              medium: 'Канал',
              campaign: 'Кампания',
              device: 'Устройство',
              browser: 'Браузер',
              os: 'ОС',
              country: 'Страна',
              path: 'Страница',
              event: 'Событие',
              event_param: 'Параметр события',
            }).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <select
            aria-label={`Оператор условия ${i + 1}`}
            value={r.op}
            onChange={(e) => update(i, { op: e.target.value })}
          >
            <option value="equals">Равно</option>
            <option value="contains">Содержит</option>
            <option value="not">Не равно / не было</option>
          </select>
          {r.field === 'event_param' && (
            <>
              <input
                aria-label={`Ключ параметра ${i + 1}`}
                placeholder="plan"
                value={r.key || ''}
                onChange={(e) => update(i, { key: e.target.value })}
              />
              <input
                aria-label={`Событие параметра ${i + 1}`}
                placeholder="Имя события (необязательно)"
                value={r.event || ''}
                onChange={(e) => update(i, { event: e.target.value })}
              />
            </>
          )}
          <input
            aria-label={`Значение условия ${i + 1}`}
            value={r.value}
            onChange={(e) => update(i, { value: e.target.value })}
          />
          <button
            className="icon"
            aria-label={`Удалить условие ${i + 1}`}
            onClick={() => setDraft((c) => ({ ...c, rules: c.rules.filter((_, n) => n !== i) }))}
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <div className="inlineForm">
        <button
          className="button"
          disabled={draft.rules.length >= 20}
          onClick={() =>
            setDraft((c) => ({
              ...c,
              rules: [...c.rules, { field: 'source', op: 'equals', value: '' }],
            }))
          }
        >
          Добавить условие
        </button>
        <button
          className="yellow"
          disabled={draft.rules.some((r) => !r.value || (r.field === 'event_param' && !r.key))}
          onClick={() => onChange(draft.rules.length ? JSON.stringify(draft) : '')}
        >
          Применить условия
        </button>
      </div>
      <p className="hint">
        Условия выделяют визиты. Для параметра события ключ и значение проверяются в одном событии;
        имя события можно уточнить.
      </p>
    </details>
  )
}
function FunnelFields({ initial, options }) {
  const [steps, setSteps] = useState(
    initial?.steps?.map(({ kind, value }) => ({ kind, value })) || [
      { kind: 'page', value: '/' },
      { kind: 'event', value: 'lead_sent' },
    ],
  )
  return (
    <>
      <Field label="Считать путь">
        <select name="scope" defaultValue={initial?.scope || 'visitor'}>
          <option value="visitor">Человек между визитами</option>
          <option value="visit">Один визит</option>
        </select>
      </Field>
      <Field label="Окно конверсии">
        <select name="window_days" defaultValue={initial?.window_days || 30}>
          {[1, 7, 30, 90].map((n) => (
            <option value={n} key={n}>
              {n} дней
            </option>
          ))}
        </select>
      </Field>
      <input type="hidden" name="steps" value={JSON.stringify(steps)} />
      <datalist id="funnel-pages">
        {options?.pages.map((p) => (
          <option key={p}>{p}</option>
        ))}
      </datalist>
      <datalist id="funnel-events">
        {options?.events.map((p) => (
          <option key={p}>{p}</option>
        ))}
      </datalist>
      {steps.map((step, i) => (
        <div className="funnelEditorRow" key={i}>
          <b>{i + 1}</b>
          <select
            aria-label={`Тип шага ${i + 1}`}
            value={step.kind}
            onChange={(e) =>
              setSteps((a) => a.map((s, n) => (n === i ? { kind: e.target.value, value: '' } : s)))
            }
          >
            <option value="page">Страница</option>
            <option value="event">Событие</option>
          </select>
          <input
            aria-label={`Условие шага ${i + 1}`}
            list={step.kind === 'page' ? 'funnel-pages' : 'funnel-events'}
            value={step.value}
            onChange={(e) =>
              setSteps((a) => a.map((s, n) => (n === i ? { ...s, value: e.target.value } : s)))
            }
            placeholder={step.kind === 'page' ? '/pricing' : 'lead_sent'}
            required
          />
          <button
            type="button"
            className="icon"
            aria-label={`Удалить шаг ${i + 1}`}
            disabled={steps.length <= 2}
            onClick={() => setSteps((a) => a.filter((_, n) => n !== i))}
          >
            <X size={15} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="button"
        disabled={steps.length >= 10}
        onClick={() => setSteps((a) => [...a, { kind: 'event', value: '' }])}
      >
        Добавить шаг
      </button>
      <p className="hint">
        Условия точные. Для межвизитного пути период определяет входы; завершения учитываются до
        конца окна, но не позже текущего момента. Объединение устройств не выполняется.
      </p>
    </>
  )
}
function Funnels({ base, query, version, add, remove, editable, edit, select }) {
  const { data, loading, error } = useData(base + '/funnels' + query, version)
  if (loading) return <div className="loading">Загружаем воронки…</div>
  if (error) return <p className="error">{error}</p>
  return (
    <>
      <div className="sectionActions">
        <p className="muted">Путь посетителя: внутри визита или между повторными визитами</p>
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
            <div>
              <h2>{f.name}</h2>
              <p>
                {f.scope === 'visitor'
                  ? `Один посетитель · окно ${f.window_days} дней · входы выбранного периода`
                  : 'Внутри одного визита'}
              </p>
            </div>
            {editable && (
              <button className="button" onClick={() => edit(f)}>
                Редактировать
              </button>
            )}
            {editable && (
              <button className="icon" aria-label="Удалить воронку" onClick={() => remove(f.id)}>
                <Trash2 size={16} />
              </button>
            )}
          </div>
          {f.truncated && (
            <p className="notice">
              Воронка ограничена первыми 100 000 событий, результат неполный. Сузьте период.
            </p>
          )}
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
                {i > 0 && <small>{fmt(s.from_start)}% от входов</small>}
                {s.dropoff > 0 && (
                  <details>
                    <summary>Ушли: {fmt(s.dropoff)}</summary>
                    {s.dropoff_visits.map((id) => (
                      <button className="textButton" key={id} onClick={() => select(id)}>
                        Визит {id.slice(-8)} ↗
                      </button>
                    ))}
                  </details>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  )
}
function Maps({ base, query, version }) {
  const [page, setPage] = useState(new URLSearchParams(query).get('path') || '')
  const options = useData(base + '/options', version)
  const mapQuery = query + '&mapPath=' + encodeURIComponent(page)
  const { data, loading, error } = useData(page ? base + '/behavior' + mapQuery : null, version),
    [tab, setTab] = useState('clicks'),
    [overlay, setOverlay] = useState(true)
  const snapshot = useData(
    tab === 'clicks' && page ? base + '/map-snapshot' + mapQuery : null,
    version,
  )
  return (
    <section className="card">
      <div className="reportToolbar">
        <label>
          Страница карты{' '}
          <select
            aria-label="Страница карты"
            value={page}
            onChange={(e) => setPage(e.target.value)}
          >
            <option value="">Выберите страницу</option>
            {options.data?.pages.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
      </div>
      {!page && (
        <p className="notice">
          Выберите конкретную страницу: события разных страниц не смешиваются.
        </p>
      )}
      {loading && <div className="loading">Загружаем карту…</div>}
      {error && <p className="error">{error}</p>}
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
                Нормализованные координаты по ширине и высоте документа. События только выбранной
                страницы карты.
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
              { key: 'conversion', label: 'Завершили из начавших', render: (n) => fmt(n) + '%' },
              { key: 'untracked_starts', label: 'Отправили без начала' },
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
  const [basis, setBasis] = useState('order')
  const { data, error, loading } = useData(
    base + '/ecommerce' + query + '&dateBasis=' + basis,
    version,
  )
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
          <div>
            <h2>Покупки</h2>
            <label>
              Период по{' '}
              <select
                aria-label="Дата ecommerce"
                value={basis}
                onChange={(e) => setBasis(e.target.value)}
              >
                <option value="order">дате заказа</option>
                <option value="visit">дате визита</option>
              </select>
            </label>
          </div>
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
  const { data, error, loading } = useData(base + '/acquisition' + query, version)
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
            <p>
              Доходы из ecommerce по дате заказа. Расходы — из вашего импорта. Валюты считаются
              отдельно.
            </p>
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
              {
                key: 'cost',
                label: 'Расходы',
                render: (n, r) => (r.has_cost ? fmt(n) : 'Не загружены'),
              },
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
              label="Дата в часовом поясе счётчика"
              type="date"
              name="day"
              defaultValue={new Intl.DateTimeFormat('en-CA', {
                timeZone: reportTimezone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
              }).format(new Date())}
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
  const [diagnosticVersion, refreshDiagnostic] = useState(0)
  const [tab, setTab] = useState('code'),
    [token, setToken] = useState(''),
    [copied, setCopied] = useState(false)
  const members = useData(site.role === 'owner' ? base + '/members' : null, version),
    keys = useData(site.role === 'owner' ? base + '/keys' : null, version),
    goals = useData(base + '/goals?days=366', version),
    diagnostics = useData(base + '/diagnostics', version + diagnosticVersion)
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
          <div className="notice">
            <b>{diagnostics.data?.last_seen ? 'События поступают' : 'Ожидаем первое событие'}</b>
            <p>
              Последнее событие:{' '}
              {diagnostics.data?.last_seen ? date(diagnostics.data.last_seen) : 'не получено'}.
              Записано сессий: {diagnostics.data?.recordings ?? '—'}.
            </p>
            <button className="button" onClick={() => refreshDiagnostic((v) => v + 1)}>
              Проверить поступление
            </button>
          </div>
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
              primary_goal: f.primary_goal,
              timezone: f.timezone,
            })
              .then(() => notify('Настройки сохранены'))
              .catch(() => {})
          }}
        >
          <Field label="Название" name="name" defaultValue={site.name} required />
          <Field label="Основная цель">
            <select name="primary_goal" defaultValue={site.primary_goal || ''}>
              <option value="">Не выбрана — любая цель</option>
              {goals.data?.map((g) => (
                <option value={g.id} key={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Часовой пояс"
            name="timezone"
            defaultValue={site.timezone || 'UTC'}
            placeholder="Europe/Moscow"
            required
          />
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
