import { useEffect, useRef, useState } from 'react'
import { segmentColor } from '../lib/colors'
import { formatTime } from '../lib/formatUtils'
import { maxClipsFor, splitEvenly } from '../lib/splitClips'
import { useEditor } from '../store/editorStore'

const QUICK = [2, 3, 4, 5, 6, 7, 8, 10]

/**
 * min:seg redondeado al segundo (todas las filas con el mismo formato).
 * Con clips cortos (< 10 s) se muestran décimas para que se distingan.
 */
function makeFmt(each: number) {
  const decimals = each < 10 ? 1 : 0
  return (t: number) => (decimals ? formatTime(Math.round(t * 10) / 10, 1) : formatTime(Math.round(t), 0))
}
/** Valor exacto (milisegundos) para el tooltip. */
const exact = (t: number) => formatTime(t, 3)

/**
 * Diálogo "Dividir en N clips": reparte la duración total en partes iguales
 * y muestra inicio, fin y duración de cada clip antes de aplicarlo.
 */
export function SplitDialog() {
  const open = useEditor((s) => s.splitOpen)
  const setOpen = useEditor((s) => s.setSplitOpen)
  const duration = useEditor((s) => s.duration)
  const existing = useEditor((s) => s.segments.length)
  const replaceSegments = useEditor((s) => s.replaceSegments)
  const [count, setCount] = useState(5)
  const [text, setText] = useState('5')
  const inputRef = useRef<HTMLInputElement>(null)

  const max = maxClipsFor(duration)
  const n = Math.min(Math.max(1, count), max)
  const clips = splitEvenly(duration, n)
  const each = clips.length ? clips[0].end - clips[0].start : 0
  const fmt = makeFmt(each)

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    inputRef.current?.select()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  if (!open || !duration) return null

  const choose = (v: number) => {
    const clamped = Math.min(Math.max(1, Math.round(v)), max)
    setCount(clamped)
    setText(String(clamped))
  }

  const apply = () => {
    replaceSegments(clips)
    setOpen(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="split-title"
        className="flex max-h-[90dvh] w-full max-w-lg flex-col gap-4 rounded-2xl bg-zinc-900 p-5 shadow-2xl ring-1 ring-zinc-700"
      >
        <div>
          <h2 id="split-title" className="text-lg font-semibold">
            Dividir en clips
          </h2>
          <p className="text-sm text-zinc-400">
            El video dura <strong className="text-zinc-200">{formatTime(Math.round(duration), 0)}</strong>. Elige cuántos clips quieres sacar y se
            repartirá en partes iguales.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <label htmlFor="split-count" className="text-sm text-zinc-300">
              Número de clips
            </label>
            <div className="ml-auto flex items-center gap-1">
              <button type="button" className="btn-icon" onClick={() => choose(n - 1)} disabled={n <= 1} aria-label="Uno menos">
                −
              </button>
              <input
                ref={inputRef}
                id="split-count"
                type="number"
                inputMode="numeric"
                min={1}
                max={max}
                value={text}
                onChange={(e) => {
                  setText(e.target.value)
                  const v = Number(e.target.value)
                  if (Number.isFinite(v) && v >= 1) setCount(Math.min(Math.round(v), max))
                }}
                onBlur={() => setText(String(n))}
                onKeyDown={(e) => e.key === 'Enter' && apply()}
                className="w-20 rounded-lg bg-zinc-800 px-2 py-1.5 text-center font-mono text-base outline-none focus:ring-2 focus:ring-violet-500"
              />
              <button type="button" className="btn-icon" onClick={() => choose(n + 1)} disabled={n >= max} aria-label="Uno más">
                +
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK.filter((q) => q <= max).map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => choose(q)}
                aria-pressed={q === n}
                className={`rounded-md px-2.5 py-1 text-sm ring-1 ${q === n ? 'bg-violet-500/20 ring-violet-500' : 'bg-zinc-800 ring-zinc-700 hover:ring-zinc-500'}`}
              >
                {q}
              </button>
            ))}
          </div>
          <p className="text-sm">
            Cada clip durará <strong className="font-mono text-violet-300">{fmt(each)}</strong>
            <span className="text-zinc-500"> · {n} clips</span>
          </p>
        </div>

        <div className="min-h-0 overflow-auto rounded-lg ring-1 ring-zinc-800">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-zinc-800 text-xs text-zinc-400">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">Clip</th>
                <th className="px-3 py-1.5 text-left font-medium">Inicio</th>
                <th className="px-3 py-1.5 text-left font-medium">Fin</th>
                <th className="px-3 py-1.5 text-right font-medium">Duración</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {clips.map((c, i) => (
                <tr key={i} className="border-t border-zinc-800">
                  <td className="px-3 py-1.5">
                    <span
                      className="inline-flex h-5 w-6 items-center justify-center rounded text-xs font-bold text-white"
                      style={{ backgroundColor: segmentColor(i) }}
                    >
                      {i + 1}
                    </span>
                  </td>
                  <td className="px-3 py-1.5" title={exact(c.start)}>
                    {fmt(c.start)}
                  </td>
                  <td className="px-3 py-1.5" title={exact(c.end)}>
                    {fmt(c.end)}
                  </td>
                  <td className="px-3 py-1.5 text-right text-zinc-400" title={exact(c.end - c.start)}>
                    {fmt(c.end - c.start)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {existing > 0 && (
          <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200 ring-1 ring-amber-500/30">
            Ya tienes {existing} segmento{existing > 1 ? 's' : ''}. Al aplicar se reemplazará{existing > 1 ? 'n' : ''} por estos {n} clips.
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
            Ahora no
          </button>
          <button type="button" className="btn-primary" onClick={apply}>
            {existing > 0 ? `Reemplazar por ${n} clips` : `Crear ${n} clips`}
          </button>
        </div>
      </div>
    </div>
  )
}
