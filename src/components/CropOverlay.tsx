import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { centeredCrop } from '../lib/geometry'
import { aspectRatio, type CropRect } from '../lib/presets'
import { useEditor } from '../store/editorStore'

type Corner = 'nw' | 'ne' | 'sw' | 'se'
type Drag =
  | { kind: 'move'; px: number; py: number; rect: CropRect }
  | { kind: 'resize'; corner: Corner; rect: CropRect }

const MIN = 0.05

/**
 * Recuadro de encuadre sobre el video (coordenadas normalizadas del video ya rotado).
 * `w`/`h`: tamaño en píxeles del video rotado (para mantener la proporción real).
 */
export function CropOverlay({ w, h }: { w: number; h: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const aspect = useEditor((s) => s.settings.aspect)
  const crop = useEditor((s) => s.crop)
  const setCrop = useEditor((s) => s.setCrop)

  const ratio = aspectRatio(aspect)
  // Proporción en espacio normalizado (ancho_n / alto_n).
  const nRatio = ratio ? (ratio * h) / w : null
  const rect = crop ?? centeredCrop(w, h, ratio)

  const toNorm = (e: { clientX: number; clientY: number }) => {
    const b = ref.current!.getBoundingClientRect()
    return { x: (e.clientX - b.left) / b.width, y: (e.clientY - b.top) / b.height }
  }

  const begin = (e: ReactPointerEvent, d: Drag) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    drag.current = d
    ref.current?.setPointerCapture(e.pointerId)
  }

  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d) return
    const p = toNorm(e)
    if (d.kind === 'move') {
      const x = Math.min(Math.max(d.rect.x + p.x - d.px, 0), 1 - d.rect.w)
      const y = Math.min(Math.max(d.rect.y + p.y - d.py, 0), 1 - d.rect.h)
      setCrop({ ...d.rect, x, y })
      return
    }
    // Esquina opuesta fija; tamaño según el puntero, limitado al cuadro.
    const r = d.rect
    const left = d.corner === 'nw' || d.corner === 'sw'
    const top = d.corner === 'nw' || d.corner === 'ne'
    const ax = left ? r.x + r.w : r.x
    const ay = top ? r.y + r.h : r.y
    const availX = left ? ax : 1 - ax
    const availY = top ? ay : 1 - ay
    let nw = Math.min(Math.max(Math.abs(p.x - ax), MIN), availX)
    let nh = Math.min(Math.max(Math.abs(p.y - ay), MIN), availY)
    if (nRatio) {
      // Se usa el eje que más ha crecido y se deriva el otro; luego se ajusta si se sale.
      nw = Math.max(nw, nh * nRatio)
      nw = Math.min(nw, availX, availY * nRatio)
      nh = nw / nRatio
    }
    setCrop({ x: left ? ax - nw : ax, y: top ? ay - nh : ay, w: nw, h: nh })
  }

  const end = () => (drag.current = null)

  const pct = (n: number) => `${n * 100}%`

  return (
    <div
      ref={ref}
      className="absolute inset-0 touch-none overflow-hidden"
      onPointerMove={onMove}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div
        className="absolute cursor-move border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
        style={{ left: pct(rect.x), top: pct(rect.y), width: pct(rect.w), height: pct(rect.h) }}
        onPointerDown={(e) => {
          const p = toNorm(e)
          begin(e, { kind: 'move', px: p.x, py: p.y, rect })
        }}
        role="group"
        aria-label="Encuadre de exportación"
      >
        {/* Guías de tercios */}
        <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="border border-white/15" />
          ))}
        </div>
        {(['nw', 'ne', 'sw', 'se'] as Corner[]).map((c) => (
          <div
            key={c}
            className={`absolute h-4 w-4 rounded-sm border-2 border-violet-500 bg-white ${
              c === 'nw' ? '-top-2 -left-2 cursor-nwse-resize' : c === 'ne' ? '-top-2 -right-2 cursor-nesw-resize' : c === 'sw' ? '-bottom-2 -left-2 cursor-nesw-resize' : '-right-2 -bottom-2 cursor-nwse-resize'
            }`}
            onPointerDown={(e) => begin(e, { kind: 'resize', corner: c, rect })}
            aria-label="Redimensionar encuadre"
          />
        ))}
      </div>
    </div>
  )
}
