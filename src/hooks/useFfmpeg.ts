import { useCallback, useEffect } from 'react'
import { CancelledError, getFFmpeg, onLoadState, terminate } from '../lib/ffmpegClient'
import { exportSegments, probe } from '../lib/exporter'
import { useEditor } from '../store/editorStore'

/** Sincroniza el estado de carga del motor con el store. Montar una sola vez (App). */
export function useFfmpegStatus() {
  const setEngine = useEditor((s) => s.setEngine)
  useEffect(
    () =>
      onLoadState((state, err) => {
        setEngine(state, err ?? null)
      }),
    [setEngine],
  )
}

/** Acciones de exportación y cancelación. */
export function useFfmpeg() {
  const setJob = useEditor((s) => s.setJob)

  const preload = useCallback(() => {
    void getFFmpeg().catch(() => {})
  }, [])

  const runExport = useCallback(async () => {
    const { file, segments, options, info: known, job } = useEditor.getState()
    if (!file || segments.length === 0 || job.kind === 'running') return
    setJob({ kind: 'running', label: 'Cargando motor de video…', progress: 0 })
    // Si el análisis del archivo aún no terminó, se espera: decide qué motor usar (ffmpeg o WebCodecs).
    const info = known ?? (await probe(file).catch(() => null))
    try {
      const results = await exportSegments(file, segments, options, info, (progress, label) =>
        setJob({ kind: 'running', label, progress }),
      )
      setJob({ kind: 'done', results })
    } catch (e) {
      if (e instanceof CancelledError) setJob({ kind: 'cancelled' })
      else setJob({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }, [setJob])

  const cancel = useCallback(() => terminate(), [])

  return { preload, runExport, cancel }
}
