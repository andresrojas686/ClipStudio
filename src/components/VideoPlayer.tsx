import { useVideoState } from '../hooks/useVideoState'
import { formatTime } from '../lib/formatUtils'
import { useEditor } from '../store/editorStore'
import { ProgressBar } from './ProgressBar'

export function VideoPlayer() {
  const ref = useVideoState()
  const previewUrl = useEditor((s) => s.previewUrl)
  const isProxy = useEditor((s) => s.isProxy)
  const proxyState = useEditor((s) => s.proxyState)
  const proxyProgress = useEditor((s) => s.proxyProgress)
  const playing = useEditor((s) => s.playing)
  const currentTime = useEditor((s) => s.currentTime)
  const duration = useEditor((s) => s.duration)
  const togglePlay = useEditor((s) => s.togglePlay)
  const seek = useEditor((s) => s.seek)

  const frame = 1 / 30

  return (
    <div className="flex flex-col gap-2">
      <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-black">
        <video
          ref={ref}
          src={previewUrl ?? undefined}
          className="h-full w-full object-contain"
          preload="auto"
          playsInline
          onClick={togglePlay}
        />
        {proxyState === 'building' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-8 text-center">
            <p className="text-sm">
              Tu navegador no reproduce este formato directamente.
              <br />
              Generando una vista previa ligera…
            </p>
            <div className="w-full max-w-xs">
              <ProgressBar value={proxyProgress} label="Vista previa" />
            </div>
          </div>
        )}
        {proxyState === 'failed' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 px-8 text-center text-sm text-red-300">
            No se pudo generar la vista previa. Puedes seguir marcando segmentos escribiendo los tiempos a mano.
          </div>
        )}
        {isProxy && (
          <span className="absolute top-2 left-2 rounded bg-black/70 px-2 py-0.5 text-xs text-zinc-300">
            Vista previa (baja resolución) — la exportación usa el original
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-icon" onClick={() => seek(currentTime - 5)} title="Retroceder 5 s">
          −5s
        </button>
        <button type="button" className="btn-icon" onClick={() => seek(currentTime - frame)} title="Fotograma anterior (←)">
          ‹
        </button>
        <button
          type="button"
          className="btn-primary min-w-24"
          onClick={togglePlay}
          disabled={!duration}
          title="Reproducir / pausar (espacio)"
        >
          {playing ? 'Pausa' : 'Reproducir'}
        </button>
        <button type="button" className="btn-icon" onClick={() => seek(currentTime + frame)} title="Fotograma siguiente (→)">
          ›
        </button>
        <button type="button" className="btn-icon" onClick={() => seek(currentTime + 5)} title="Avanzar 5 s">
          +5s
        </button>
        <span className="ml-auto font-mono text-sm tabular-nums text-zinc-300">
          {formatTime(currentTime, 2)} / {formatTime(duration, 2)}
        </span>
      </div>
    </div>
  )
}
