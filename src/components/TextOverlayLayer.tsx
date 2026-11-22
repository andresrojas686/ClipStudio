import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { isActiveAt, MAX_TEXT_SIZE, MIN_TEXT_SIZE, MIN_TEXT_WIDTH, type TextOverlay } from '../lib/textOverlay'
import { drawText, layoutText, loadTextFonts } from '../lib/textRender'
import { useEditor } from '../store/editorStore'

type Handle = 'nw' | 'ne' | 'sw' | 'se' | 'w' | 'e'
type Drag = {
  id: string
  handle: Handle | 'move'
  /** Puntero inicial (normalizado al cuadro). */
  px: number
  py: number
  start: TextOverlay
  /** Alto de la caja al empezar (normalizado). */
  hN: number
}

export interface FrameRect {
  left: number
  top: number
  width: number
  height: number
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi))

/** Campo de texto del panel; el doble clic en una caja lo enfoca. */
export const TEXT_EDITOR_INPUT_ID = 'text-editor-input'

/**
 * Capa de textos sobre el cuadro de salida: dibuja los textos activos (mismo renderizador que la
 * exportación) y permite mover la caja, escalarla por las esquinas y cambiar su ancho por los lados.
 */
export function TextOverlayLayer({ frame }: { frame: FrameRect }) {
  const texts = useEditor((s) => s.texts)
  const selectedTextId = useEditor((s) => s.selectedTextId)
  const currentTime = useEditor((s) => s.currentTime)
  const selectText = useEditor((s) => s.selectText)
  const updateText = useEditor((s) => s.updateText)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ghostRef = useRef<HTMLCanvasElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const [fontsReady, setFontsReady] = useState(false)

  useEffect(() => {
    let alive = true
    void loadTextFonts().then(() => alive && setFontsReady(true))
    return () => {
      alive = false
    }
  }, [])

  const W = frame.width
  const H = frame.height
  const visible = texts.filter((t) => isActiveAt(t, currentTime) || t.id === selectedTextId)
  const isGhost = (t: TextOverlay) => !isActiveAt(t, currentTime)

  useEffect(() => {
    const dpr = window.devicePixelRatio || 1
    for (const [ref, ghost] of [
      [canvasRef, false],
      [ghostRef, true],
    ] as const) {
      const canvas = ref.current
      if (!canvas) continue
      canvas.width = Math.max(1, Math.round(W * dpr))
      canvas.height = Math.max(1, Math.round(H * dpr))
      const ctx = canvas.getContext('2d')!
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (const t of visible) if (isGhost(t) === ghost) drawText(ctx, t, canvas.width, canvas.height)
    }
    // visible/isGhost dependen de estos valores.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texts, currentTime, selectedTextId, W, H, fontsReady])

  if (!W || !H) return null

  const toNorm = (e: { clientX: number; clientY: number }) => {
    const b = layerRef.current!.getBoundingClientRect()
    return { x: (e.clientX - b.left) / b.width, y: (e.clientY - b.top) / b.height }
  }

  const begin = (e: ReactPointerEvent, t: TextOverlay, handle: Drag['handle']) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    selectText(t.id)
    const p = toNorm(e)
    drag.current = { id: t.id, handle, px: p.x, py: p.y, start: t, hN: layoutText(t, W, H).height / H }
    // La captura va en el elemento pulsado; sus eventos suben hasta la capa (onPointerMove).
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  }

  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d) return
    const p = toNorm(e)
    const s = d.start
    if (d.handle === 'move') {
      updateText(d.id, { x: clamp(s.x + p.x - d.px, 0, 1 - s.w), y: clamp(s.y + p.y - d.py, 0, 1 - d.hN) })
      return
    }
    const right = s.x + s.w
    if (d.handle === 'e' || d.handle === 'w') {
      // Lados: solo cambia el ancho (el texto se re-ajusta).
      if (d.handle === 'e') updateText(d.id, { w: clamp(p.x - s.x, MIN_TEXT_WIDTH, 1 - s.x) })
      else {
        const x = clamp(p.x, 0, right - MIN_TEXT_WIDTH)
        updateText(d.id, { x, w: right - x })
      }
      return
    }
    // Esquinas: escala ancho y tamaño de letra a la vez, con la esquina opuesta fija.
    const west = d.handle === 'nw' || d.handle === 'sw'
    const north = d.handle === 'nw' || d.handle === 'ne'
    const maxW = west ? right : 1 - s.x
    let w = clamp(west ? right - p.x : p.x - s.x, MIN_TEXT_WIDTH, maxW)
    let k = w / s.w
    k = clamp(k, MIN_TEXT_SIZE / s.size, MAX_TEXT_SIZE / s.size)
    w = Math.min(s.w * k, maxW)
    const x = west ? right - w : s.x
    const bottom = s.y + d.hN
    const y = north ? clamp(bottom - d.hN * k, 0, 1) : s.y
    updateText(d.id, { x, y, w, size: s.size * k })
  }

  const end = () => {
    drag.current = null
  }

  return (
    <div
      ref={layerRef}
      className="pointer-events-none absolute"
      style={{ left: frame.left, top: frame.top, width: W, height: H }}
      onPointerMove={onMove}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <canvas ref={ghostRef} className="absolute inset-0 h-full w-full opacity-40" aria-hidden />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />
      {visible.map((t) => {
        const L = layoutText(t, W, H)
        const selected = t.id === selectedTextId
        return (
          <div
            key={t.id}
            role="button"
            aria-label={`Texto: ${t.text}`}
            title={selected ? 'Arrastra para mover · esquinas: tamaño · lados: ancho' : 'Clic para seleccionar'}
            className={`pointer-events-auto absolute cursor-move touch-none ${
              selected ? 'outline-2 outline-violet-400 outline-dashed' : 'hover:outline-1 hover:outline-white/50 hover:outline-dashed'
            }`}
            style={{ left: L.x, top: L.y, width: L.width, height: L.height }}
            onPointerDown={(e) => begin(e, t, 'move')}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={() => {
              const el = document.getElementById(TEXT_EDITOR_INPUT_ID) as HTMLTextAreaElement | null
              el?.focus()
              el?.select()
            }}
          >
            {selected &&
              (['nw', 'ne', 'sw', 'se', 'w', 'e'] as Handle[]).map((h) => (
                <span
                  key={h}
                  onPointerDown={(e) => begin(e, t, h)}
                  className="absolute h-3 w-3 rounded-sm border border-violet-600 bg-white"
                  style={{
                    left: h.includes('w') ? -6 : undefined,
                    right: h.includes('e') ? -6 : undefined,
                    top: h === 'w' || h === 'e' ? 'calc(50% - 6px)' : h.includes('n') ? -6 : undefined,
                    bottom: h.includes('s') ? -6 : undefined,
                    cursor: h === 'w' || h === 'e' ? 'ew-resize' : h === 'nw' || h === 'se' ? 'nwse-resize' : 'nesw-resize',
                  }}
                />
              ))}
          </div>
        )
      })}
    </div>
  )
}
