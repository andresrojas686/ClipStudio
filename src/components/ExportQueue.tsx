import { useFfmpeg } from '../hooks/useFfmpeg'
import { formatBytes, formatTime } from '../lib/formatUtils'
import { effectiveSettings } from '../lib/exporter'
import { computeGeometry } from '../lib/geometry'
import { isStreamCopy, presetName } from '../lib/presets'
import { useEditor, type ExportResult, type QueueJob } from '../store/editorStore'
import { ProgressBar } from './ProgressBar'

const STATUS: Record<QueueJob['status'], { text: string; cls: string }> = {
  pending: { text: 'En cola', cls: 'bg-zinc-700 text-zinc-200' },
  running: { text: 'Procesando', cls: 'bg-violet-600 text-white' },
  done: { text: 'Listo', cls: 'bg-emerald-600 text-white' },
  error: { text: 'Error', cls: 'bg-red-600 text-white' },
  cancelled: { text: 'Cancelado', cls: 'bg-zinc-700 text-zinc-300' },
}

/** "TikTok · 1080×1920 · 2 clips (1:15)". */
function jobTitle(job: QueueJob, width: number | null, height: number | null) {
  const s = effectiveSettings(job.settings, job.texts, job.segments)
  const dims = isStreamCopy(s)
    ? 'sin re-codificar'
    : width && height
      ? (() => {
          const g = computeGeometry(s, job.crop, width, height)
          return `${g.outW}×${g.outH}${s.rotation ? ` · ${s.rotation}°` : ''}`
        })()
      : ''
  const total = job.segments.reduce((a, seg) => a + seg.end - seg.start, 0)
  const n = job.segments.length
  const what = n > 1 && s.combine === 'merge' ? `${n} segmentos unidos` : `${n} clip${n > 1 ? 's' : ''}`
  return { name: presetName(s.presetId), detail: [dims, `${what} (${formatTime(total, 0)})`].filter(Boolean).join(' · ') }
}

export function ExportQueue() {
  const queue = useEditor((s) => s.queue)
  const queueRunning = useEditor((s) => s.queueRunning)
  const engine = useEditor((s) => s.engine)
  const info = useEditor((s) => s.info)
  const removeJob = useEditor((s) => s.removeJob)
  const clearFinished = useEditor((s) => s.clearFinished)
  const { processQueue, cancelCurrent, cancelAll } = useFfmpeg()

  if (queue.length === 0) return null

  const pending = queue.filter((j) => j.status === 'pending').length
  const finished = queue.filter((j) => j.status !== 'pending' && j.status !== 'running').length

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
          Cola de exportación · {queue.length}
        </h3>
        <div className="flex gap-1.5">
          {finished > 0 && (
            <button type="button" className="text-xs text-zinc-400 hover:text-zinc-200" onClick={clearFinished}>
              Limpiar terminados
            </button>
          )}
        </div>
      </div>

      <ol className="flex flex-col gap-2">
        {queue.map((job) => {
          const { name, detail } = jobTitle(job, info?.width ?? null, info?.height ?? null)
          const st = STATUS[job.status]
          return (
            <li key={job.id} className="flex flex-col gap-2 rounded-lg bg-zinc-900 p-2.5 ring-1 ring-zinc-800">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{name}</p>
                  <p className="truncate text-xs text-zinc-400" title={detail}>
                    {detail}
                  </p>
                </div>
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.text}</span>
                {job.status === 'running' ? (
                  <button type="button" className="btn-icon h-6 min-w-6 text-xs" title="Cancelar este trabajo" onClick={cancelCurrent}>
                    ■
                  </button>
                ) : (
                  <button type="button" className="btn-icon h-6 min-w-6 text-xs hover:text-red-400" title="Quitar de la cola" onClick={() => removeJob(job.id)}>
                    ✕
                  </button>
                )}
              </div>
              {job.status === 'running' && (
                <ProgressBar value={job.progress} label={engine === 'loading' ? 'Cargando motor de video (~30 MB)…' : job.label} />
              )}
              {job.status === 'error' && (
                <pre className="max-h-28 overflow-auto rounded bg-red-500/10 p-2 text-xs whitespace-pre-wrap text-red-300">
                  {job.error}
                </pre>
              )}
              {job.status === 'done' && <Results results={job.results} />}
            </li>
          )
        })}
      </ol>

      {queueRunning ? (
        <button type="button" className="btn-secondary" onClick={cancelAll}>
          Cancelar todo
        </button>
      ) : (
        pending > 0 && (
          <button type="button" className="btn-primary" onClick={processQueue}>
            Procesar cola ({pending} pendiente{pending > 1 ? 's' : ''})
          </button>
        )
      )}
    </div>
  )
}

function Results({ results }: { results: ExportResult[] }) {
  const downloadAll = async () => {
    for (const r of results) {
      triggerDownload(r.url, r.name)
      // Pausa breve: algunos navegadores ignoran descargas disparadas a la vez.
      await new Promise((res) => setTimeout(res, 400))
    }
  }
  return (
    <div className="flex flex-col gap-1">
      <ul className="flex flex-col gap-1">
        {results.map((r) => (
          <li key={r.url} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate font-mono text-xs" title={r.name}>
              {r.name}
            </span>
            <span className="text-xs text-zinc-400">{formatBytes(r.size)}</span>
            <a className="btn-primary px-2.5 py-1 text-xs" href={r.url} download={r.name}>
              Descargar
            </a>
          </li>
        ))}
      </ul>
      {results.length > 1 && (
        <button type="button" className="btn-secondary self-end px-2.5 py-1 text-xs" onClick={downloadAll}>
          Descargar todos
        </button>
      )}
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
