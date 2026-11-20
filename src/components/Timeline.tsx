import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { segmentColor } from '../lib/colors'
import { MIN_SEGMENT_SECONDS, formatTime, rulerStep } from '../lib/formatUtils'
import { neighborBounds, useEditor } from '../store/editorStore'

type Drag = { kind: 'seek' } | { kind: 'start' | 'end'; id: string }

export function Timeline() {
  const trackRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const duration = useEditor((s) => s.duration)
  const currentTime = useEditor((s) => s.currentTime)
  const segments = useEditor((s) => s.segments)
  const selectedId = useEditor((s) => s.selectedId)
  const markIn = useEditor((s) => s.markIn)
  const seek = useEditor((s) => s.seek)
  const selectSegment = useEditor((s) => s.selectSegment)
  const updateSegment = useEditor((s) => s.updateSegment)

  if (!duration) {
    return <div className="h-24 animate-pulse rounded-xl bg-zinc-900" aria-label="Cargando línea de tiempo" />
  }

  const pct = (t: number) => `${(t / duration) * 100}%`

  const timeAt = (clientX: number) => {
    const rect = trackRef.current!.getBoundingClientRect()
    return Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1) * duration
  }

  const applyDrag = (clientX: number) => {
    const d = drag.current
    if (!d) return
    const t = timeAt(clientX)
    if (d.kind === 'seek') {
      seek(t)
      return
    }
    const { segments: segs } = useEditor.getState()
    const seg = segs.find((s) => s.id === d.id)
    if (!seg) return
    const { min, max } = neighborBounds(segs, d.id, duration)
    if (d.kind === 'start') {
      const start = Math.min(Math.max(t, min), seg.end - MIN_SEGMENT_SECONDS)
      updateSegment(d.id, start, seg.end)
      seek(start)
    } else {
      const end = Math.max(Math.min(t, max), seg.start + MIN_SEGMENT_SECONDS)
      updateSegment(d.id, seg.start, end)
      seek(end)
    }
  }

  const begin = (e: ReactPointerEvent, d: Drag) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    drag.current = d
    trackRef.current?.setPointerCapture(e.pointerId)
    if (d.kind === 'seek') applyDrag(e.clientX)
  }

  const step = rulerStep(duration)
  const ticks: number[] = []
  for (let t = 0; t <= duration + 1e-6; t += step) ticks.push(t)

  return (
    <div className="flex flex-col gap-1 select-none">
      {/* Regla */}
      <div className="relative h-5 text-[10px] text-zinc-500">
        {ticks.map((t) => (
          <span
            key={t}
            className="absolute top-0 -translate-x-1/2 font-mono whitespace-nowrap first:translate-x-0"
            style={{ left: pct(t) }}
          >
            {formatTime(t, step < 1 ? 1 : 0)}
          </span>
        ))}
      </div>

      {/* Pista */}
      <div
        ref={trackRef}
        className="relative h-20 cursor-pointer touch-none rounded-lg bg-zinc-900 ring-1 ring-zinc-800"
        onPointerDown={(e) => {
          selectSegment(null)
          begin(e, { kind: 'seek' })
        }}
        onPointerMove={(e) => drag.current && applyDrag(e.clientX)}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        role="slider"
        aria-label="Línea de tiempo"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(currentTime)}
        aria-valuetext={formatTime(currentTime)}
      >
        {ticks.map((t) => (
          <div key={t} className="absolute top-0 h-full w-px bg-zinc-800" style={{ left: pct(t) }} />
        ))}

        {segments.map((seg, i) => {
          const color = segmentColor(i)
          const selected = seg.id === selectedId
          return (
            <div
              key={seg.id}
              className={`absolute top-2 bottom-2 rounded-md ${selected ? 'z-10 ring-2 ring-white' : ''}`}
              style={{ left: pct(seg.start), width: pct(seg.end - seg.start), backgroundColor: `${color}55`, borderColor: color }}
              onPointerDown={(e) => {
                selectSegment(seg.id)
                begin(e, { kind: 'seek' })
              }}
              title={`Segmento ${i + 1}: ${formatTime(seg.start)} – ${formatTime(seg.end)}`}
            >
              <span
                className="pointer-events-none absolute top-1 left-1/2 -translate-x-1/2 rounded px-1 text-xs font-semibold text-white"
                style={{ backgroundColor: color }}
              >
                {i + 1}
              </span>
              <Handle color={color} side="left" onPointerDown={(e) => {
                selectSegment(seg.id)
                begin(e, { kind: 'start', id: seg.id })
              }} />
              <Handle color={color} side="right" onPointerDown={(e) => {
                selectSegment(seg.id)
                begin(e, { kind: 'end', id: seg.id })
              }} />
            </div>
          )
        })}

        {markIn !== null && (
          <div className="pointer-events-none absolute top-0 z-20 h-full w-0.5 bg-emerald-400" style={{ left: pct(markIn) }}>
            <span className="absolute -top-0.5 left-1 rounded bg-emerald-500 px-1 text-[10px] font-bold text-black">IN</span>
          </div>
        )}

        {/* Cabezal */}
        <div className="pointer-events-none absolute top-0 z-30 h-full" style={{ left: pct(currentTime) }}>
          <div className="absolute -top-1.5 -left-1.5 h-3 w-3 rotate-45 bg-red-500" />
          <div className="h-full w-0.5 -translate-x-1/4 bg-red-500" />
        </div>
      </div>
    </div>
  )
}

function Handle({
  color,
  side,
  onPointerDown,
}: {
  color: string
  side: 'left' | 'right'
  onPointerDown: (e: ReactPointerEvent) => void
}) {
  return (
    <div
      className={`absolute top-0 flex h-full w-3 cursor-ew-resize items-center justify-center ${side === 'left' ? '-left-1.5 rounded-l-md' : '-right-1.5 rounded-r-md'}`}
      style={{ backgroundColor: color }}
      onPointerDown={onPointerDown}
      aria-label={side === 'left' ? 'Inicio del segmento' : 'Fin del segmento'}
    >
      <div className="h-5 w-0.5 rounded bg-white/80" />
    </div>
  )
}
