import type { ReactNode } from 'react'
import { useFfmpeg } from '../hooks/useFfmpeg'
import { isStreamCopy } from '../lib/ffmpegCommands'
import { formatBytes, getExtension } from '../lib/formatUtils'
import { useEditor, type ExportOptions } from '../store/editorStore'
import { ProgressBar } from './ProgressBar'

function Choice<K extends keyof ExportOptions>({
  name,
  field,
  options,
}: {
  name: string
  field: K
  options: { value: ExportOptions[K]; label: string; hint: string }[]
}) {
  const value = useEditor((s) => s.options[field])
  const setOptions = useEditor((s) => s.setOptions)
  const disabled = useEditor((s) => s.job.kind === 'running')
  return (
    <fieldset className="flex flex-col gap-1.5" disabled={disabled}>
      <legend className="mb-1 text-xs font-semibold tracking-wide text-zinc-400 uppercase">{name}</legend>
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => (
          <label
            key={String(o.value)}
            className={`flex cursor-pointer flex-col rounded-lg px-3 py-2 ring-1 transition ${
              value === o.value ? 'bg-violet-500/15 ring-violet-500' : 'bg-zinc-900 ring-zinc-800 hover:ring-zinc-600'
            }`}
          >
            <input
              type="radio"
              className="sr-only"
              name={field}
              checked={value === o.value}
              onChange={() => setOptions({ [field]: o.value } as Partial<ExportOptions>)}
            />
            <span className="text-sm font-medium">{o.label}</span>
            <span className="text-xs text-zinc-400">{o.hint}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function ExportPanel() {
  const file = useEditor((s) => s.file)
  const segments = useEditor((s) => s.segments)
  const options = useEditor((s) => s.options)
  const job = useEditor((s) => s.job)
  const engine = useEditor((s) => s.engine)
  const { runExport, cancel } = useFfmpeg()

  const running = job.kind === 'running'
  const ext = file ? getExtension(file.name) : ''
  const copy = isStreamCopy(options)

  return (
    <section className="flex flex-col gap-4">
      <Choice
        name="Formato"
        field="format"
        options={[
          { value: 'original', label: 'Original', hint: 'Mismo encuadre y resolución' },
          { value: 'vertical', label: 'Vertical 9:16', hint: 'TikTok, Reels, Shorts' },
        ]}
      />

      {options.format === 'vertical' ? (
        <Choice
          name="Modo vertical"
          field="verticalMode"
          options={[
            { value: 'crop', label: 'Recorte central', hint: 'Llena la pantalla, corta los lados' },
            { value: 'blur', label: 'Fondo desenfocado', hint: 'Video completo sobre fondo borroso' },
          ]}
        />
      ) : (
        <Choice
          name="Corte"
          field="cutMode"
          options={[
            { value: 'fast', label: 'Rápido', hint: 'Sin re-codificar; corta en keyframes' },
            { value: 'precise', label: 'Preciso', hint: 'Re-codifica a MP4; exacto al fotograma' },
          ]}
        />
      )}

      {segments.length > 1 && (
        <Choice
          name="Varios segmentos"
          field="combine"
          options={[
            { value: 'separate', label: 'Clips separados', hint: `${segments.length} archivos` },
            { value: 'merge', label: 'Un solo video', hint: 'Unidos en el orden de la lista' },
          ]}
        />
      )}

      <p className="text-xs text-zinc-500">
        Salida: {copy ? `.${ext} (mismo códec que el original)` : 'MP4 · H.264 + AAC'}
        {options.format === 'vertical' && ' · 1080×1920'}
        {!copy && ' · re-codificar en el navegador puede tardar varias veces la duración del clip.'}
      </p>

      {running ? (
        <div className="flex flex-col gap-2">
          <ProgressBar value={job.progress} label={engine === 'loading' ? 'Cargando motor de video (~30 MB)…' : job.label} />
          <button type="button" className="btn-secondary self-start" onClick={cancel}>
            Cancelar
          </button>
        </div>
      ) : (
        <button type="button" className="btn-primary py-3 text-base" disabled={segments.length === 0} onClick={runExport}>
          {segments.length === 0
            ? 'Añade al menos un segmento'
            : `Exportar ${segments.length > 1 && options.combine === 'separate' ? `${segments.length} clips` : 'clip'}`}
        </button>
      )}

      {job.kind === 'error' && (
        <Alert tone="error">
          <p className="font-medium">No se pudo exportar.</p>
          <pre className="mt-1 max-h-32 overflow-auto text-xs whitespace-pre-wrap opacity-80">{job.message}</pre>
          {copy && <p className="mt-1">Prueba con el corte “Preciso”: algunos códecs no se pueden copiar tal cual.</p>}
        </Alert>
      )}
      {job.kind === 'cancelled' && <Alert tone="info">Exportación cancelada.</Alert>}
      {job.kind === 'done' && <Results results={job.results} />}
    </section>
  )
}

function Results({ results }: { results: { name: string; url: string; size: number }[] }) {
  const downloadAll = async () => {
    for (const r of results) {
      triggerDownload(r.url, r.name)
      // Pausa breve: algunos navegadores ignoran descargas disparadas a la vez.
      await new Promise((res) => setTimeout(res, 400))
    }
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-emerald-500/10 p-3 ring-1 ring-emerald-500/30">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-emerald-300">
          {results.length === 1 ? 'Clip listo' : `${results.length} clips listos`}
        </p>
        {results.length > 1 && (
          <button type="button" className="btn-secondary text-xs" onClick={downloadAll}>
            Descargar todos
          </button>
        )}
      </div>
      <ul className="flex flex-col gap-1">
        {results.map((r) => (
          <li key={r.url} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate font-mono text-xs" title={r.name}>
              {r.name}
            </span>
            <span className="text-xs text-zinc-400">{formatBytes(r.size)}</span>
            <a className="btn-primary px-3 py-1 text-xs" href={r.url} download={r.name}>
              Descargar
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

function triggerDownload(url: string, name: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
}

function Alert({ tone, children }: { tone: 'error' | 'info'; children: ReactNode }) {
  const cls = tone === 'error' ? 'bg-red-500/10 text-red-300 ring-red-500/30' : 'bg-zinc-800 text-zinc-300 ring-zinc-700'
  return <div className={`rounded-lg p-3 text-sm ring-1 ${cls}`}>{children}</div>
}
