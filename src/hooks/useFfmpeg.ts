import { useEffect } from 'react'
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

let stopRequested = false

/**
 * Procesa la cola: toma el primer trabajo pendiente, lo exporta y sigue con el siguiente.
 * Solo hay un procesador activo a la vez.
 */
async function processQueue() {
  const st = useEditor.getState
  if (st().queueRunning) return
  const file = st().file
  if (!file) return
  stopRequested = false
  st().setQueueRunning(true)
  try {
    for (;;) {
      if (stopRequested || st().file !== file) break
      const job = st().queue.find((j) => j.status === 'pending')
      if (!job) break
      const { updateJob } = st()
      updateJob(job.id, { status: 'running', progress: 0, label: 'Cargando motor de video…' })
      try {
        // Si el análisis del archivo aún no terminó, se espera: decide qué motor usar (ffmpeg o WebCodecs).
        const info = st().info ?? (await probe(file).catch(() => null))
        const results = await exportSegments(file, job.segments, job.settings, job.crop, info, (progress, label) =>
          updateJob(job.id, { progress, label }),
        )
        // Si mientras tanto se cambió de video, los resultados ya no pertenecen a la cola actual.
        if (st().file !== file) {
          results.forEach((r) => URL.revokeObjectURL(r.url))
          break
        }
        updateJob(job.id, { status: 'done', progress: 1, label: 'Listo', results })
      } catch (e) {
        if (e instanceof CancelledError) updateJob(job.id, { status: 'cancelled', label: 'Cancelado' })
        else updateJob(job.id, { status: 'error', label: 'Error', error: e instanceof Error ? e.message : String(e) })
      }
    }
  } finally {
    st().setQueueRunning(false)
  }
}

/** Añade un trabajo con los ajustes actuales y arranca la cola si está parada. */
function exportNow() {
  if (useEditor.getState().enqueue()) void processQueue()
}

/** Cancela el trabajo en curso; la cola sigue con el siguiente. */
function cancelCurrent() {
  terminate()
}

/** Cancela el trabajo en curso y descarta los pendientes. */
function cancelAll() {
  stopRequested = true
  const { queue, updateJob } = useEditor.getState()
  queue.filter((j) => j.status === 'pending').forEach((j) => updateJob(j.id, { status: 'cancelled', label: 'Cancelado' }))
  if (queue.some((j) => j.status === 'running')) terminate()
}

function preload() {
  void getFFmpeg().catch(() => {})
}

/** Acciones de exportación (funciones estables, sin estado propio). */
export function useFfmpeg() {
  return {
    preload,
    exportNow,
    enqueue: () => useEditor.getState().enqueue(),
    processQueue: () => void processQueue(),
    cancelCurrent,
    cancelAll,
  }
}
