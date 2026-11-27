import { useState } from 'react'
import { formatTime, parseTime } from '../lib/formatUtils'
import { useEditor, type Segment } from '../store/editorStore'
import { segmentColor } from '../lib/colors'
import { TimeInput } from './TimeInput'

export function SegmentControls() {
  const setMarkIn = useEditor((s) => s.setMarkIn)
  const markOut = useEditor((s) => s.markOut)
  const addSegmentAtPlayhead = useEditor((s) => s.addSegmentAtPlayhead)
  const setSplitOpen = useEditor((s) => s.setSplitOpen)
  const markIn = useEditor((s) => s.markIn)
  const notice = useEditor((s) => s.notice)
  const duration = useEditor((s) => s.duration)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" onClick={setMarkIn} disabled={!duration} title="Tecla I">
          Marcar inicio <kbd>I</kbd>
        </button>
        <button type="button" className="btn-secondary" onClick={markOut} disabled={!duration} title="Tecla O">
          Marcar fin <kbd>O</kbd>
        </button>
        <button type="button" className="btn-secondary" onClick={addSegmentAtPlayhead} disabled={!duration}>
          + Añadir segmento aquí
        </button>
        <button type="button" className="btn-secondary" onClick={() => setSplitOpen(true)} disabled={!duration}>
          ✂ Dividir en N clips…
        </button>
        {markIn !== null && (
          <span className="self-center text-sm text-emerald-400">Inicio en {formatTime(markIn, 2)} — ahora marca el fin</span>
        )}
      </div>
      {notice && <p className="text-sm text-amber-300">{notice}</p>}
    </div>
  )
}

export function SegmentList() {
  const segments = useEditor((s) => s.segments)
  const selectedId = useEditor((s) => s.selectedId)

  if (segments.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-800 px-4 py-6 text-center text-sm text-zinc-500">
        Aún no hay segmentos. Usa <kbd>I</kbd> y <kbd>O</kbd> mientras reproduces, o “Añadir segmento aquí”.
      </p>
    )
  }

  const total = segments.reduce((a, s) => a + s.end - s.start, 0)

  return (
    <div className="flex flex-col gap-2">
      <ol className="flex flex-col gap-2">
        {segments.map((seg, i) => (
          <SegmentRow key={seg.id} seg={seg} index={i} count={segments.length} selected={seg.id === selectedId} />
        ))}
      </ol>
      <p className="text-right text-xs text-zinc-500">
        {segments.length} segmento{segments.length > 1 ? 's' : ''} · total {formatTime(total, 1)}
      </p>
    </div>
  )
}

function SegmentRow({ seg, index, count, selected }: { seg: Segment; index: number; count: number; selected: boolean }) {
  const updateSegment = useEditor((s) => s.updateSegment)
  const removeSegment = useEditor((s) => s.removeSegment)
  const moveSegment = useEditor((s) => s.moveSegment)
  const selectSegment = useEditor((s) => s.selectSegment)
  const playRange = useEditor((s) => s.playRange)
  const seek = useEditor((s) => s.seek)
  const speed = useEditor((s) => s.settings.speed)
  const [error, setError] = useState<string | null>(null)
  const color = segmentColor(index)

  const commit = (which: 'start' | 'end', text: string) => {
    const t = parseTime(text)
    if (t === null) {
      setError('Tiempo no válido (usa mm:ss.d)')
      return false
    }
    const err = which === 'start' ? updateSegment(seg.id, t, seg.end) : updateSegment(seg.id, seg.start, t)
    setError(err)
    return !err
  }

  return (
    <li
      className={`flex flex-col gap-1 rounded-lg bg-zinc-900 p-2 ring-1 ${selected ? 'ring-white/60' : 'ring-zinc-800'}`}
      onClick={() => selectSegment(seg.id)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-bold text-white"
          style={{ backgroundColor: color }}
        >
          {index + 1}
        </span>
        <TimeInput label="Inicio" value={seg.start} onCommit={(t) => commit('start', t)} onFocus={() => seek(seg.start)} />
        <span className="text-zinc-600">→</span>
        <TimeInput label="Fin" value={seg.end} onCommit={(t) => commit('end', t)} onFocus={() => seek(seg.end)} />
        <span className="font-mono text-xs text-zinc-400 tabular-nums" title={speed !== 1 ? 'Duración original → duración final con la velocidad elegida' : undefined}>
          {formatTime(seg.end - seg.start, 1)}
          {speed !== 1 && <span className="text-violet-300"> → {formatTime((seg.end - seg.start) / speed, 1)}</span>}
        </span>
        <div className="ml-auto flex gap-1">
          <button type="button" className="btn-icon" title="Previsualizar segmento" onClick={() => playRange(seg.start, seg.end)}>
            ▶
          </button>
          <button type="button" className="btn-icon" title="Subir (orden de exportación)" disabled={index === 0} onClick={() => moveSegment(seg.id, -1)}>
            ↑
          </button>
          <button type="button" className="btn-icon" title="Bajar (orden de exportación)" disabled={index === count - 1} onClick={() => moveSegment(seg.id, 1)}>
            ↓
          </button>
          <button type="button" className="btn-icon hover:text-red-400" title="Eliminar segmento" onClick={() => removeSegment(seg.id)}>
            ✕
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </li>
  )
}
