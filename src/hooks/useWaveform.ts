import { useEffect, useState } from 'react'
import { computeWaveform } from '../lib/waveform'
import { useEditor } from '../store/editorStore'

export type WaveformState =
  | { status: 'idle' }
  | { status: 'loading'; peaks: Float32Array; progress: number; version: number }
  | { status: 'done'; peaks: Float32Array; version: number }
  | { status: 'no-audio' }
  | { status: 'error' }

/** Calcula la forma de onda del archivo actual en segundo plano, con actualizaciones progresivas. */
export function useWaveform(): WaveformState {
  const file = useEditor((s) => s.file)
  // Solo importa saber cuándo hay duración; pequeños ajustes posteriores no recalculan.
  const ready = useEditor((s) => s.duration > 0)
  const [state, setState] = useState<WaveformState>({ status: 'idle' })

  useEffect(() => {
    if (!file || !ready) return
    let alive = true
    let version = 0
    const job = computeWaveform(file, useEditor.getState().duration, (progress) => {
      // Los picos se actualizan en el mismo array; `version` fuerza el redibujado.
      if (alive) setState({ status: 'loading', peaks: job.peaks, progress, version: ++version })
    })
    job.promise.then(
      (r) => {
        if (alive) setState(r === 'no-audio' ? { status: 'no-audio' } : { status: 'done', peaks: job.peaks, version: ++version })
      },
      () => {
        if (alive) setState({ status: 'error' })
      },
    )
    return () => {
      alive = false
      job.cancel()
      setState({ status: 'idle' })
    }
  }, [file, ready])

  return state
}
