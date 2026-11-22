import { useEffect, useRef, useState, type FormEvent } from 'react'
import { formatTime } from '../lib/formatUtils'
import { useYoutubeAvailable } from '../hooks/useYoutubeAvailable'
import { download, getInfo, looksLikeYoutube, thumbUrl, type YtInfo, type YtProgress } from '../lib/youtube'
import { useEditor } from '../store/editorStore'

const PHASE_LABEL: Record<YtProgress['phase'], string> = {
  video: 'Descargando video…',
  audio: 'Descargando audio…',
  merge: 'Uniendo video y audio…',
  transfer: 'Cargando en el editor…',
}

/** Importar un video desde un link de YouTube (yt-dlp en el servidor local). */
export function YoutubeImport({ onDone }: { onDone?: () => void }) {
  const setFile = useEditor((s) => s.setFile)
  const health = useYoutubeAvailable()
  const [url, setUrl] = useState('')
  const [info, setInfo] = useState<YtInfo | null>(null)
  const [height, setHeight] = useState(1080)
  const [busy, setBusy] = useState<'info' | 'download' | null>(null)
  const [progress, setProgress] = useState<YtProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cancelRef = useRef<(() => void) | null>(null)

  useEffect(() => () => cancelRef.current?.(), [])

  if (health === null || health === false) return null

  if (!health.ok) {
    return (
      <p className="rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
        Importar desde YouTube no está disponible: falta {health.ytdlp ? 'ffmpeg (ffmpeg-static)' : 'yt-dlp'}. Ejecuta{' '}
        <code className="font-mono">npm run update-ytdlp</code> y reinicia el servidor.
      </p>
    )
  }

  const search = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    if (!looksLikeYoutube(url)) {
      setError('Pega un link de YouTube (youtube.com/watch?v=…, youtu.be/… o youtube.com/shorts/…).')
      return
    }
    const abort = new AbortController()
    cancelRef.current = () => abort.abort()
    setBusy('info')
    try {
      const i = await getInfo(url, abort.signal)
      setInfo(i)
      setHeight(i.heights.includes(1080) ? 1080 : (i.heights.at(-1) ?? 1080))
    } catch (err) {
      if (!abort.signal.aborted) setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
      cancelRef.current = null
    }
  }

  const start = async () => {
    setError(null)
    setProgress({ phase: 'video', ratio: 0 })
    setBusy('download')
    const job = download(url, height, setProgress)
    cancelRef.current = job.cancel
    try {
      const file = await job.promise
      setFile(file)
      onDone?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
      setProgress(null)
      cancelRef.current = null
    }
  }

  const cancel = () => cancelRef.current?.()
  const pct = progress ? Math.round(progress.ratio * 100) : 0

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={search} className="flex gap-2">
        <input
          type="text"
          inputMode="url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value)
            setInfo(null)
          }}
          placeholder="Pega un link de YouTube"
          aria-label="Link de YouTube"
          disabled={busy === 'download'}
          className="min-w-0 flex-1 rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none ring-1 ring-zinc-700 placeholder:text-zinc-500 focus:ring-2 focus:ring-violet-500"
        />
        {busy === 'info' ? (
          <button type="button" className="btn-secondary" onClick={cancel}>
            Cancelar
          </button>
        ) : (
          <button type="submit" className="btn-secondary" disabled={!url.trim() || busy !== null}>
            Buscar
          </button>
        )}
      </form>

      {busy === 'info' && <p className="text-sm text-zinc-400">Buscando el video…</p>}

      {info && (
        <div className="flex flex-col gap-3 rounded-xl bg-zinc-900 p-3 ring-1 ring-zinc-800 sm:flex-row">
          {info.thumbnail && (
            <img
              src={thumbUrl(info.thumbnail)}
              alt=""
              className="aspect-video w-full rounded-lg bg-zinc-800 object-cover sm:w-44"
              onError={(e) => (e.currentTarget.style.display = 'none')}
            />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div>
              <p className="line-clamp-2 font-medium" title={info.title}>
                {info.title}
              </p>
              <p className="text-xs text-zinc-400">
                {info.channel && <>{info.channel} · </>}
                {formatTime(Math.round(info.duration), 0)}
              </p>
            </div>

            {busy === 'download' && progress ? (
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-xs text-zinc-400">
                  <span>{PHASE_LABEL[progress.phase]}</span>
                  {progress.phase !== 'merge' && <span className="font-mono">{pct}%</span>}
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className={`h-full rounded-full bg-violet-500 transition-[width] ${progress.phase === 'merge' ? 'w-full animate-pulse' : ''}`}
                    style={progress.phase === 'merge' ? undefined : { width: `${pct}%` }}
                  />
                </div>
                <button type="button" className="btn-secondary self-start" onClick={cancel}>
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-sm text-zinc-300">
                  Calidad
                  <select
                    value={height}
                    onChange={(e) => setHeight(Number(e.target.value))}
                    className="rounded-lg bg-zinc-800 px-2 py-1.5 text-sm ring-1 ring-zinc-700 outline-none focus:ring-violet-500"
                  >
                    {info.heights.map((h) => (
                      <option key={h} value={h}>
                        {h}p
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="btn-primary" onClick={start}>
                  Descargar y editar
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {error && <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
    </div>
  )
}
