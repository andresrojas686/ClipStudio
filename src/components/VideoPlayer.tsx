import { useEffect, useRef, useState, type RefObject } from 'react'
import { useVideoState } from '../hooks/useVideoState'
import { formatTime } from '../lib/formatUtils'
import { rotatedSize } from '../lib/geometry'
import { usesCrop } from '../lib/presets'
import { useEditor } from '../store/editorStore'
import { CropOverlay } from './CropOverlay'
import { ProgressBar } from './ProgressBar'

function useElementSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ w: width, h: height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return size
}

export function VideoPlayer() {
  const ref = useVideoState()
  const boxRef = useRef<HTMLDivElement>(null)
  const previewUrl = useEditor((s) => s.previewUrl)
  const isProxy = useEditor((s) => s.isProxy)
  const proxyState = useEditor((s) => s.proxyState)
  const proxyProgress = useEditor((s) => s.proxyProgress)
  const playing = useEditor((s) => s.playing)
  const currentTime = useEditor((s) => s.currentTime)
  const duration = useEditor((s) => s.duration)
  const togglePlay = useEditor((s) => s.togglePlay)
  const seek = useEditor((s) => s.seek)

  const info = useEditor((s) => s.info)
  const settings = useEditor((s) => s.settings)
  const box = useElementSize(boxRef)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)

  const frame = 1 / 30

  // Tamaño real del video (el proxy tiene otra resolución pero la misma proporción).
  const srcW = info?.width ?? natural?.w ?? 16
  const srcH = info?.height ?? natural?.h ?? 9
  const rotation = settings.rotation
  const quarter = rotation === 90 || rotation === 270
  const rot = rotatedSize(srcW, srcH, rotation)
  const scale = box.w && box.h ? Math.min(box.w / rot.w, box.h / rot.h) : 0
  const stage = { w: rot.w * scale, h: rot.h * scale }
  const showCrop = usesCrop(settings) && duration > 0 && proxyState !== 'building'

  return (
    <div className="flex flex-col gap-2">
      <div ref={boxRef} className="relative aspect-video overflow-hidden rounded-xl bg-black">
        {/* Escenario con la proporción del video ya rotado; el encuadre se dibuja encima. */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ width: stage.w, height: stage.h }}
        >
          <video
            ref={ref}
            src={previewUrl ?? undefined}
            className="absolute top-1/2 left-1/2 max-w-none object-fill"
            style={{
              width: quarter ? stage.h : stage.w,
              height: quarter ? stage.w : stage.h,
              transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
            }}
            preload="auto"
            playsInline
            onClick={togglePlay}
            onLoadedMetadata={(e) => setNatural({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })}
          />
          {showCrop && <CropOverlay w={rot.w} h={rot.h} />}
        </div>
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
