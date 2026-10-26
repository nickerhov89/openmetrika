import { useEffect, useRef, useState } from 'react'
import 'rrweb/dist/style.css'

export default function MapOverlay({ snapshot, clicks }) {
  const outer = useRef(),
    mount = useRef(),
    [error, setError] = useState('')
  useEffect(() => {
    let player,
      alive = true,
      observer,
      timer
    import('rrweb')
      .then(({ Replayer }) => {
        if (!alive) return
        player = new Replayer(snapshot.events, {
          root: mount.current,
          showWarning: false,
          mouseTail: false,
          insertStyleRules: ['*{caret-color:transparent !important}'],
        })
        const render = () => {
          if (!alive) return
          const iframe = player.iframe,
            doc = iframe?.contentDocument
          if (!doc?.body) return
          doc.getElementById('om-heat-layer')?.remove()
          const width = snapshot.events[0].data.width || 1280,
            height = Math.max(
              doc.documentElement.scrollHeight,
              doc.body.scrollHeight,
              snapshot.events[0].data.height || 800,
            )
          iframe.style.width = width + 'px'
          iframe.style.height = height + 'px'
          const scale = Math.min(1, (outer.current.clientWidth - 2) / width)
          player.wrapper.style.width = width + 'px'
          player.wrapper.style.height = height + 'px'
          player.wrapper.style.transform = `scale(${scale})`
          player.wrapper.style.transformOrigin = 'top left'
          mount.current.style.height = height * scale + 'px'
          const layer = doc.createElement('div')
          layer.id = 'om-heat-layer'
          layer.setAttribute(
            'style',
            `position:absolute;top:0;left:0;width:${width}px;height:${height}px;pointer-events:none;z-index:2147483647;overflow:hidden;mix-blend-mode:multiply`,
          )
          for (const c of clicks.filter((c) => c.path === snapshot.path).slice(0, 10000)) {
            const dot = doc.createElement('i'),
              x = (c.x / (c.width || width)) * width,
              y = (c.y / (c.height || height)) * height
            dot.setAttribute(
              'style',
              `position:absolute;left:${x - 28}px;top:${y - 28}px;width:56px;height:56px;border-radius:50%;background:radial-gradient(circle,#e63820aa 0%,#ffb70088 35%,#ffe26600 75%)`,
            )
            layer.append(dot)
          }
          doc.documentElement.style.position = 'relative'
          doc.body.append(layer)
        }
        player.on('fullsnapshot-rebuilded', () => {
          timer = setTimeout(render, 100)
        })
        player.pause(Math.max(1, snapshot.events[1].timestamp - snapshot.events[0].timestamp + 1))
        timer = setTimeout(render, 150)
        observer = new ResizeObserver(render)
        observer.observe(outer.current)
      })
      .catch((e) => alive && setError(e.message))
    return () => {
      alive = false
      clearTimeout(timer)
      observer?.disconnect()
      player?.destroy()
      mount.current?.replaceChildren()
    }
  }, [snapshot, clicks])
  return (
    <div className="snapshotMap" ref={outer}>
      <div className="heatLegend">
        Сохранённый снимок: {snapshot.path}
        <span>Клики поверх DOM · приватные блоки скрыты</span>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="snapshotViewport">
        <div ref={mount} />
      </div>
    </div>
  )
}
