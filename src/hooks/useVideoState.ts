import { useEffect, useRef } from 'react'
import { CancelledError } from '../lib/ffmpegClient'
import { buildPreviewProxy, probe } from '../lib/exporter'
import { useEditor } from '../store/editorStore'

/**
 * Conecta el <video> con el store: tiempo actual (vía requestAnimationFrame mientras reproduce),
 * estado de reproducción, parada al final de un segmento previsualizado,
 * y fallback a un proxy cuando el navegador no puede reproducir el archivo.
 */
export function useVideoState() {
  const ref = useRef<HTMLVideoElement>(null)
  const file = useEditor((s) => s.file)
  const previewUrl = useEditor((s) => s.previewUrl)

  // Registro del elemento y eventos.
  useEffect(() => {
    const video = ref.current
    if (!video) return
    const st = useEditor.getState
    st().setVideoEl(video)

    let raf = 0
    const tick = () => {
      const { playUntil, setCurrentTime } = st()
      if (playUntil !== null && video.currentTime >= playUntil) {
        video.pause()
        video.currentTime = playUntil
        useEditor.setState({ playUntil: null })
      }
      setCurrentTime(video.currentTime)
      if (!video.paused) raf = requestAnimationFrame(tick)
    }
    const onPlay = () => {
      st().setPlaying(true)
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(tick)
    }
    const onPause = () => {
      st().setPlaying(false)
      cancelAnimationFrame(raf)
      st().setCurrentTime(video.currentTime)
    }
    const onSeeked = () => st().setCurrentTime(video.currentTime)
    const onMeta = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) st().setDuration(video.duration)
    }
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('ended', onPause)
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('loadedmetadata', onMeta)
    video.addEventListener('durationchange', onMeta)
    return () => {
      cancelAnimationFrame(raf)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('ended', onPause)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('loadedmetadata', onMeta)
      video.removeEventListener('durationchange', onMeta)
      st().setVideoEl(null)
    }
  }, [previewUrl])

  // Análisis del archivo + proxy si el navegador no lo reproduce.
  useEffect(() => {
    const video = ref.current
    if (!file || !video) return
    let alive = true
    const st = useEditor.getState
    const probed = probe(file).then(
      (info) => {
        if (alive && st().file === file) st().setHasAudio(info.hasAudio)
        return info
      },
      () => null,
    )

    let proxyStarted = false
    const startProxy = async () => {
      if (proxyStarted || !alive) return
      proxyStarted = true
      st().setProxyState('building', 0)
      try {
        const info = await probed
        if (info?.duration) st().setDuration(info.duration)
        const url = await buildPreviewProxy(file, info?.hasAudio ?? true, info?.duration ?? null, (p) => {
          if (alive) st().setProxyState('building', p)
        })
        if (!alive || st().file !== file) {
          URL.revokeObjectURL(url)
          return
        }
        st().setPreview(url, true)
        st().setProxyState('none')
      } catch (e) {
        if (alive && !(e instanceof CancelledError)) st().setProxyState('failed')
      }
    }

    // Errores de decodificación o video sin imagen (p. ej. códec no soportado) → proxy.
    const onError = () => void startProxy()
    const onMeta = () => {
      if (video.videoWidth === 0) void startProxy()
    }
    video.addEventListener('error', onError)
    video.addEventListener('loadedmetadata', onMeta)
    if (video.error) void startProxy()
    return () => {
      alive = false
      video.removeEventListener('error', onError)
      video.removeEventListener('loadedmetadata', onMeta)
    }
  }, [file])

  return ref
}
