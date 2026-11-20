import type { ReactNode } from 'react'
import { useFfmpeg } from '../hooks/useFfmpeg'
import { needsBrowserDecoder } from '../lib/exporter'
import { formatBytes, getExtension } from '../lib/formatUtils'
import { describeOutput } from '../lib/geometry'
import { isStreamCopy } from '../lib/presets'
import { useEditor } from '../store/editorStore'
import { ExportSettingsPanel } from './ExportSettingsPanel'
import { ProgressBar } from './ProgressBar'

export function ExportPanel() {
  const file = useEditor((s) => s.file)
  const segments = useEditor((s) => s.segments)
  const settings = useEditor((s) => s.settings)
  const crop = useEditor((s) => s.crop)
  const info = useEditor((s) => s.info)
  const job = useEditor((s) => s.job)
  const engine = useEditor((s) => s.engine)
  const { runExport, cancel } = useFfmpeg()

  const running = job.kind === 'running'
  const ext = file ? getExtension(file.name) : ''
  const copy = isStreamCopy(settings)
  const browserDecode = needsBrowserDecoder(info, settings)

  return (
    <section className="flex flex-col gap-4">
      <ExportSettingsPanel />

      <p className="text-xs text-zinc-500">
        Salida: {describeOutput(settings, crop, info?.width ?? null, info?.height ?? null, ext)}
        {!copy && !browserDecode && ' · re-codificar en el navegador puede tardar varias veces la duración del clip.'}
      </p>
      {browserDecode && (
        <p className="rounded-lg bg-sky-500/10 px-3 py-2 text-xs text-sky-200 ring-1 ring-sky-500/30">
          Este video es <strong>{info?.videoCodec?.toUpperCase()}</strong>: se convertirá con el decodificador nativo del
          navegador (WebCodecs) en lugar de ffmpeg.wasm.
        </p>
      )}

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
            : `Exportar ${segments.length > 1 && settings.combine === 'separate' ? `${segments.length} clips` : 'clip'}`}
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
