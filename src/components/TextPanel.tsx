import { useState, type ReactNode } from 'react'
import { formatTime, parseTime } from '../lib/formatUtils'
import { computeGeometry } from '../lib/geometry'
import { FONTS, MAX_TEXT_SIZE, MIN_TEXT_SIZE, type TextAlign, type TextBg, type TextOverlay } from '../lib/textOverlay'
import { layoutText } from '../lib/textRender'
import { useEditor } from '../store/editorStore'
import { TEXT_EDITOR_INPUT_ID } from './TextOverlayLayer'
import { TimeInput } from './TimeInput'

const SWATCHES = ['#ffffff', '#000000', '#facc15', '#ef4444', '#22c55e', '#3b82f6', '#a855f7']

/** Sección "Textos": lista de cajas de texto y editor de la seleccionada. */
export function TextPanel() {
  const texts = useEditor((s) => s.texts)
  const selectedTextId = useEditor((s) => s.selectedTextId)
  const addText = useEditor((s) => s.addText)
  const selectText = useEditor((s) => s.selectText)
  const removeText = useEditor((s) => s.removeText)
  const duration = useEditor((s) => s.duration)
  const selected = texts.find((t) => t.id === selectedTextId) ?? null

  return (
    <div className="flex flex-col gap-2">
      {texts.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-800 px-4 py-4 text-center text-sm text-zinc-500">
          Añade un texto: aparece en la posición actual del video durante 3 s. Arrástralo sobre el video para colocarlo.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {texts.map((t) => (
            <li
              key={t.id}
              className={`flex items-center gap-2 rounded-lg bg-zinc-900 px-2 py-1.5 text-sm ring-1 ${
                t.id === selectedTextId ? 'ring-violet-400' : 'ring-zinc-800 hover:ring-zinc-600'
              }`}
            >
              <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => selectText(t.id)}>
                <span className="text-violet-300">T</span>
                <span className="min-w-0 flex-1 truncate">{t.text.trim() || <em className="text-zinc-500">(vacío)</em>}</span>
                <span className="shrink-0 font-mono text-xs text-zinc-400 tabular-nums">
                  {formatTime(t.start, 1)}–{formatTime(t.end, 1)}
                </span>
              </button>
              <button type="button" className="btn-icon hover:text-red-400" title="Eliminar texto" onClick={() => removeText(t.id)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="btn-secondary self-start" onClick={addText} disabled={!duration}>
        + Añadir texto
      </button>
      {selected && <TextEditor key={selected.id} text={selected} />}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-zinc-400">{label}</span>
      {children}
    </div>
  )
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex overflow-hidden rounded-md ring-1 ring-zinc-700">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          title={o.title}
          aria-pressed={o.v === value}
          onClick={() => onChange(o.v)}
          className={`flex-1 px-2 py-1 text-sm ${o.v === value ? 'bg-violet-500/30 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function ColorPicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {SWATCHES.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`${label} ${c}`}
          onClick={() => onChange(c)}
          className={`h-6 w-6 rounded-full ring-2 ${value.toLowerCase() === c ? 'ring-violet-400' : 'ring-zinc-700'}`}
          style={{ backgroundColor: c }}
        />
      ))}
      <input
        type="color"
        aria-label={`${label} personalizado`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-6 w-8 cursor-pointer rounded bg-transparent"
      />
    </div>
  )
}

function TextEditor({ text: t }: { text: TextOverlay }) {
  const updateText = useEditor((s) => s.updateText)
  const currentTime = useEditor((s) => s.currentTime)
  const seek = useEditor((s) => s.seek)
  const playRange = useEditor((s) => s.playRange)
  const settings = useEditor((s) => s.settings)
  const crop = useEditor((s) => s.crop)
  const info = useEditor((s) => s.info)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<TextOverlay>) => setError(updateText(t.id, patch))

  const commitTime = (which: 'start' | 'end', raw: string) => {
    const v = parseTime(raw)
    if (v === null) {
      setError('Tiempo no válido (usa mm:ss.d)')
      return false
    }
    const err = updateText(t.id, { [which]: v })
    setError(err)
    return !err
  }

  /** Posiciones rápidas: centra en horizontal y coloca arriba / centro / abajo. */
  const place = (where: 'top' | 'middle' | 'bottom') => {
    // Alto real de la caja en el cuadro de salida actual (depende de su proporción).
    const g = info?.width && info.height ? computeGeometry(settings, crop, info.width, info.height) : { outW: 1920, outH: 1080 }
    const hN = layoutText(t, g.outW, g.outH).height / g.outH
    const y = where === 'top' ? 0.06 : where === 'middle' ? (1 - hN) / 2 : 0.94 - hN
    set({ x: (1 - t.w) / 2, y: Math.min(Math.max(0, y), 1 - hN) })
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-zinc-900 p-3 ring-1 ring-zinc-800">
      <textarea
        id={TEXT_EDITOR_INPUT_ID}
        value={t.text}
        onChange={(e) => set({ text: e.target.value })}
        rows={2}
        placeholder="Escribe el mensaje"
        className="resize-y rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none ring-1 ring-zinc-700 focus:ring-2 focus:ring-violet-500"
      />

      <div className="flex flex-wrap items-end gap-2">
        <Field label="Inicio">
          <div className="flex gap-1">
            <TimeInput label="Inicio del texto" value={t.start} onCommit={(v) => commitTime('start', v)} onFocus={() => seek(t.start)} />
            <button type="button" className="btn-icon" title="Usar la posición actual" onClick={() => set({ start: currentTime })}>
              ⟲
            </button>
          </div>
        </Field>
        <Field label="Fin">
          <div className="flex gap-1">
            <TimeInput label="Fin del texto" value={t.end} onCommit={(v) => commitTime('end', v)} onFocus={() => seek(t.end)} />
            <button type="button" className="btn-icon" title="Usar la posición actual" onClick={() => set({ end: currentTime })}>
              ⟲
            </button>
          </div>
        </Field>
        <button type="button" className="btn-icon" title="Reproducir el tramo del texto" onClick={() => playRange(t.start, t.end)}>
          ▶
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Fuente">
          <select
            value={t.font}
            onChange={(e) => set({ font: e.target.value as TextOverlay['font'] })}
            className="rounded-md bg-zinc-800 px-2 py-1 text-sm ring-1 ring-zinc-700 outline-none focus:ring-violet-500"
          >
            {FONTS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Tamaño · ${Math.round(t.size * 1000) / 10} %`}>
          <input
            type="range"
            min={MIN_TEXT_SIZE}
            max={MAX_TEXT_SIZE / 2}
            step={0.001}
            value={t.size}
            onChange={(e) => set({ size: Number(e.target.value) })}
            className="accent-violet-500"
          />
        </Field>
        <Field label="Estilo">
          <div className="flex gap-1">
            <button
              type="button"
              aria-pressed={t.bold}
              onClick={() => set({ bold: !t.bold })}
              className={`rounded-md px-2.5 py-1 text-sm font-bold ring-1 ${t.bold ? 'bg-violet-500/30 ring-violet-400' : 'bg-zinc-800 ring-zinc-700'}`}
            >
              N
            </button>
            <Seg<TextAlign>
              value={t.align}
              onChange={(align) => set({ align })}
              options={[
                { v: 'left', label: '⯇', title: 'Alinear a la izquierda' },
                { v: 'center', label: '≡', title: 'Centrar' },
                { v: 'right', label: '⯈', title: 'Alinear a la derecha' },
              ]}
            />
          </div>
        </Field>
        <Field label="Posición rápida">
          <Seg<'top' | 'middle' | 'bottom' | ''>
            value=""
            onChange={(v) => v && place(v)}
            options={[
              { v: 'top', label: 'Arriba' },
              { v: 'middle', label: 'Centro' },
              { v: 'bottom', label: 'Abajo' },
            ]}
          />
        </Field>
      </div>

      <Field label="Color del texto">
        <ColorPicker label="Color del texto" value={t.color} onChange={(color) => set({ color })} />
      </Field>
      <Field label="Fondo">
        <Seg<TextBg>
          value={t.bg}
          onChange={(bg) => set({ bg })}
          options={[
            { v: 'none', label: 'Ninguno' },
            { v: 'box', label: 'Caja' },
            { v: 'outline', label: 'Contorno' },
          ]}
        />
      </Field>
      {t.bg !== 'none' && (
        <Field label={t.bg === 'box' ? 'Color de la caja (semitransparente)' : 'Color del contorno'}>
          <ColorPicker label="Color de fondo" value={t.bgColor} onChange={(bgColor) => set({ bgColor })} />
        </Field>
      )}
    </div>
  )
}
