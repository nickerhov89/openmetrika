import { record } from 'rrweb'

// Every dependency is bundled into om.js. No CDN or third-party collector.
const script =
  document.currentScript ||
  [...document.scripts].find((s) => s.dataset.site && s.src.includes('om.js'))
if (script?.dataset.site) boot(script)
function boot(script) {
  const site = script.dataset.site,
    base = (script.dataset.host || new URL(script.src).origin).replace(/\/$/, ''),
    key = `om_${site}`
  const uuid = () =>
    crypto.randomUUID?.().replaceAll('-', '') ||
    Math.random().toString(36).slice(2) + Date.now().toString(36)
  let enabled = false,
    visitor = '',
    session = '',
    sessionMeta = {},
    lastActivity = Date.now(),
    lastInteraction = Date.now(),
    stopRecord = null,
    queue = [],
    recordings = [],
    sending = false,
    started = false,
    heartbeat = Date.now(),
    maxDepth = -1
  const previous = window.om?.q || [],
    required = script.dataset.consent === 'required'
  const storage = {
    get(k) {
      try {
        return localStorage.getItem(k)
      } catch {
        return null
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, v)
      } catch {}
    },
    remove(k) {
      try {
        localStorage.removeItem(k)
      } catch {}
    },
  }
  const urlMeta = () => {
    const q = new URLSearchParams(location.search)
    return {
      path: location.pathname,
      referrer: document.referrer,
      width: innerWidth,
      height: innerHeight,
      utm_source: q.get('utm_source') || '',
      utm_medium: q.get('utm_medium') || '',
      utm_campaign: q.get('utm_campaign') || '',
    }
  }
  const privateElement = (el) =>
    Boolean(
      el?.closest?.('.om-block,[data-om-private],input,textarea,select,[contenteditable="true"]'),
    )
  function identify() {
    visitor = storage.get(key + '_visitor') || uuid()
    storage.set(key + '_visitor', visitor)
    let prior
    try {
      prior = JSON.parse(sessionStorage.getItem(key + '_session') || 'null')
    } catch {}
    session = prior && Date.now() - prior.at < 30 * 60000 ? prior.id : uuid()
    sessionMeta = prior && prior.id === session && prior.meta ? prior.meta : urlMeta()
    touch()
  }
  function touch() {
    lastActivity = Date.now()
    try {
      sessionStorage.setItem(
        key + '_session',
        JSON.stringify({ id: session, at: lastActivity, meta: sessionMeta }),
      )
    } catch {}
  }
  function emit(type, name = '', props = {}, path = location.pathname) {
    if (!enabled) return
    if (Date.now() - lastActivity > 30 * 60000) {
      session = uuid()
      sessionMeta = urlMeta()
      maxDepth = -1
      stopRecord?.()
      startRecording()
      queue.push({
        sid: session,
        meta: sessionMeta,
        id: uuid(),
        type: 'pageview',
        ts: Date.now(),
        path: location.pathname,
        name: '',
        props: {},
      })
    }
    if (type !== 'heartbeat') touch()
    queue.push({
      sid: session,
      meta: sessionMeta,
      id: uuid(),
      type,
      ts: Date.now(),
      path,
      name,
      props,
    })
    if (queue.length > 1000) queue.splice(0, queue.length - 1000)
    if (queue.length >= 50) void flush()
  }
  async function post(suffix, body, beacon = false) {
    const text = JSON.stringify(body)
    if (beacon && navigator.sendBeacon)
      return navigator.sendBeacon(
        `${base}/collect/${site}${suffix}`,
        new Blob([text], { type: 'text/plain' }),
      )
    try {
      const r = await fetch(`${base}/collect/${site}${suffix}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: text,
        credentials: 'omit',
        keepalive: text.length < 60000,
      })
      return r.ok
    } catch {
      return false
    }
  }
  async function flush(beacon = false) {
    if (!enabled || sending) return
    sending = true
    try {
      while (queue.length) {
        const sid = queue[0].sid,
          meta = queue[0].meta
        const length = queue.findIndex((e) => e.sid !== sid),
          events = queue.splice(0, Math.min(100, length < 0 ? queue.length : length))
        const ok = await post(
          '',
          { session: sid, visitor, meta, events: events.map(({ sid, meta, ...e }) => e) },
          beacon,
        )
        if (!ok) {
          queue.unshift(...events)
          return
        }
        if (beacon) break
      }
      if (recordings.length) {
        const batch = recordings.shift()
        const ok = await post(
          '/replay',
          { session: batch.sid, visitor, chunk: batch.chunk, events: batch.events },
          beacon,
        )
        if (!ok) recordings.unshift(batch)
      }
    } finally {
      sending = false
    }
  }
  function startRecording() {
    if (script.dataset.replay !== 'true' || !enabled) return
    const sid = session
    let batch = null
    stopRecord = record({
      emit(event) {
        if (event.type === 4 && event.data?.href) {
          try {
            const u = new URL(event.data.href)
            event.data.href = u.origin + u.pathname
          } catch {}
        }
        if (
          !batch ||
          batch.events.length >= 300 ||
          batch.sid !== sid ||
          !recordings.includes(batch)
        ) {
          batch = { sid, chunk: uuid(), events: [] }
          recordings.push(batch)
        }
        batch.events.push(event)
        if (recordings.length > 30) recordings.shift()
      },
      maskAllInputs: true,
      maskTextClass: 'om-mask',
      blockClass: 'om-block',
      blockSelector: '[data-om-private],[contenteditable],[role="textbox"]',
      slimDOMOptions: true,
      recordCanvas: false,
      collectFonts: false,
      inlineStylesheet: true,
      checkoutEveryNms: 120000,
      sampling: { mousemove: 100, scroll: 150, input: 'last' },
    })
  }
  function start() {
    if (enabled || navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true) return
    enabled = true
    identify()
    emit('pageview')
    startRecording()
    setTimeout(() => void flush(), 1000)
    if (!started) {
      started = true
      bind()
    }
  }
  function stop() {
    enabled = false
    queue = []
    recordings = []
    stopRecord?.()
    stopRecord = null
    storage.remove(key + '_visitor')
    try {
      sessionStorage.removeItem(key + '_session')
    } catch {}
  }
  window.om = (command, ...args) => {
    if (command === 'consent') {
      if (args[0]) start()
      else stop()
      return
    }
    if (command === 'event' || command === 'goal')
      emit('event', String(args[0] || ''), args[1] || {})
    if (command === 'ecommerce') emit('ecommerce', '', args[0] || {})
    if (command === 'pageview') emit('pageview')
    if (command === 'flush') return flush()
    if (command === 'getClientId') return enabled ? visitor : null
  }
  function bind() {
    for (const type of ['pointerdown', 'keydown', 'scroll', 'touchstart'])
      document.addEventListener(
        type,
        () => {
          lastInteraction = Date.now()
        },
        { passive: true },
      )
    const selector = (el) =>
      el.id
        ? `#${el.id}`
        : el.tagName.toLowerCase() +
          (typeof el.className === 'string' && el.className
            ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
            : '')
    document.addEventListener(
      'click',
      (event) => {
        const el = event.target instanceof Element ? event.target : null
        if (!el || privateElement(el)) return
        const a = el.closest('a[href]'),
          rect = document.documentElement
        emit('click', '', {
          x: event.pageX,
          y: event.pageY,
          width: rect.clientWidth,
          height: rect.scrollHeight,
          selector: selector(el),
          link: a?.getAttribute('href') || '',
          label:
            el.closest('.om-mask') || /^tel:|^mailto:/i.test(a?.getAttribute('href') || '')
              ? ''
              : (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 120),
        })
        if (a) {
          let url
          try {
            url = new URL(a.href)
          } catch {
            return
          }
          if (['tel:', 'mailto:'].includes(url.protocol)) {
            emit('event', url.protocol === 'tel:' ? 'click_phone' : 'click_email')
            return
          }
          if (a.download || /\.(pdf|zip|xlsx?|docx?|csv|exe|dmg)$/i.test(url.pathname))
            emit('download', '', {
              url: url.origin + url.pathname,
              extension: url.pathname.split('.').pop(),
            })
          else if (url.host !== location.host && /^https?:$/.test(url.protocol))
            emit('outbound', '', { url: url.origin + url.pathname })
        }
      },
      { passive: true, capture: true },
    )
    const formIds = new WeakMap(),
      seenForms = new WeakSet(),
      seenFields = new WeakSet()
    const formName = (form) => {
      if (!formIds.has(form))
        formIds.set(
          form,
          form.id || form.getAttribute('name') || `form-${[...document.forms].indexOf(form) + 1}`,
        )
      return formIds.get(form)
    }
    document.addEventListener('focusin', (event) => {
      const field = event.target,
        form = field.form
      if (!form || form.closest('.om-block,[data-om-private]')) return
      if (!seenForms.has(form)) {
        seenForms.add(form)
        emit('form_start', '', { form: formName(form) })
      }
      if (!seenFields.has(field)) {
        seenFields.add(field)
        emit('form_field', '', {
          form: formName(form),
          field: field.name || field.id || field.tagName.toLowerCase(),
        })
      }
    })
    document.addEventListener('submit', (event) => {
      const form = event.target
      if (form.closest('.om-block,[data-om-private]')) return
      emit('form_submit', '', { form: formName(form) })
      emit('event', 'form_submit')
      void flush()
    })
    function scroll() {
      const h = document.documentElement.scrollHeight - innerHeight
      const depth = h > 0 ? Math.min(100, Math.round((scrollY / h) * 100)) : 100
      const threshold = Math.floor(depth / 10) * 10
      if (threshold > maxDepth) {
        maxDepth = threshold
        emit('scroll', '', { depth: threshold })
      }
    }
    let pending
    window.addEventListener(
      'scroll',
      () => {
        clearTimeout(pending)
        pending = setTimeout(scroll, 250)
      },
      { passive: true },
    )
    scroll()
    for (const method of ['pushState', 'replaceState']) {
      const original = history[method]
      history[method] = function (...args) {
        const before = location.pathname
        const result = original.apply(this, args)
        if (location.pathname !== before) {
          emit('pageview')
          maxDepth = -1
          scroll()
        }
        return result
      }
    }
    window.addEventListener('popstate', () => {
      emit('pageview')
      maxDepth = -1
      scroll()
    })
    const pulse = () => {
      const now = Date.now()
      if (enabled && document.visibilityState === 'visible' && now - lastInteraction < 60000)
        emit('heartbeat', '', { seconds: Math.min(15, Math.round((now - heartbeat) / 1000)) })
      heartbeat = now
    }
    setInterval(() => {
      pulse()
      void flush()
    }, 10000)
    document.addEventListener('visibilitychange', () => {
      pulse()
      if (document.visibilityState === 'hidden') void flush(true)
    })
    window.addEventListener('pagehide', () => {
      pulse()
      void flush(true)
    })
    const performancePath = location.pathname,
      vitals = {}
    let lastVitals = ''
    const saveVitals = () => {
      const state = JSON.stringify(vitals)
      if (state !== lastVitals && Object.keys(vitals).length) {
        lastVitals = state
        emit('performance', '', vitals, performancePath)
      }
    }
    const navigation = () =>
      setTimeout(() => {
        const nav = performance.getEntriesByType('navigation')[0]
        if (nav) {
          vitals.load_ms = Math.round(nav.loadEventEnd || nav.duration)
          saveVitals()
        }
      }, 0)
    if (document.readyState === 'complete') navigation()
    else window.addEventListener('load', navigation, { once: true })
    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries()
        vitals.lcp_ms = Math.round(entries[entries.length - 1].startTime)
      }).observe({ type: 'largest-contentful-paint', buffered: true })
    } catch {}
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          if (!entry.hadRecentInput) vitals.cls = (vitals.cls || 0) + entry.value
      }).observe({ type: 'layout-shift', buffered: true })
    } catch {}
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        saveVitals()
        void flush(true)
      }
    })
    window.addEventListener('error', (event) => {
      if (event.error)
        emit('error', '', {
          message: String(event.message || 'Script error').replace(/https?:\/\/\S+/g, '[url]'),
        })
    })
  }
  if (!required) start()
  for (const args of previous) window.om(...args)
}
