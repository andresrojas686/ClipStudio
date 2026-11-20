import { withFFmpeg } from './ffmpegClient'
import { buildWaveformArgs } from './ffmpegCommands'

/** Número de "barras" que se calculan para todo el video (se re-muestrean al ancho en pantalla). */
export const WAVEFORM_BUCKETS = 4000

export interface WaveformJob {
  peaks: Float32Array
  /** Resuelve con 'done', 'no-audio' o lanza si falla. */
  promise: Promise<'done' | 'no-audio'>
  cancel: () => void
}

/** Acumula el pico absoluto de `samples` (que empiezan en `t0` s) en los buckets correspondientes. */
function accumulate(peaks: Float32Array, samples: Float32Array, count: number, t0: number, sampleRate: number, duration: number) {
  const n = peaks.length
  const perBucket = (duration / n) * sampleRate // muestras por bucket
  let i = 0
  while (i < count) {
    const b = Math.floor(((t0 + i / sampleRate) / duration) * n)
    if (b >= n) break
    if (b < 0) {
      i++
      continue
    }
    // Fin del bucket actual (en índice de muestra dentro de este bloque).
    const end = Math.min(count, Math.ceil((b + 1) * perBucket - t0 * sampleRate))
    let max = peaks[b]
    for (let k = i; k < end; k++) {
      const v = samples[k] < 0 ? -samples[k] : samples[k]
      if (v > max) max = v
    }
    peaks[b] = max
    i = Math.max(end, i + 1)
  }
}

/**
 * Calcula la forma de onda del primer audio del archivo.
 * Usa el decodificador nativo del navegador (rápido, por partes, sin cargar todo en memoria);
 * si no puede, recurre a FFmpeg extrayendo audio mono a baja frecuencia.
 * `onUpdate(progress)` se llama periódicamente para dibujar mientras avanza.
 */
export function computeWaveform(file: File, duration: number, onUpdate: (progress: number) => void): WaveformJob {
  const peaks = new Float32Array(WAVEFORM_BUCKETS)
  let cancelled = false

  const viaBrowser = async (): Promise<'done' | 'no-audio' | 'unsupported'> => {
    const { Input, BlobSource, ALL_FORMATS, AudioSampleSink } = await import('mediabunny')
    let input
    try {
      input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
      const track = await input.getPrimaryAudioTrack()
      if (!track) return 'no-audio'
      if (!(await track.canDecode())) return 'unsupported'
      const sink = new AudioSampleSink(track)
      let buf = new Float32Array(0)
      let lastReport = 0
      for await (const sample of sink.samples()) {
        if (cancelled) {
          sample.close()
          break
        }
        const count = sample.numberOfFrames
        if (buf.length < count) buf = new Float32Array(count)
        sample.copyTo(buf, { planeIndex: 0, format: 'f32-planar' })
        accumulate(peaks, buf, count, sample.timestamp, sample.sampleRate, duration)
        const t = sample.timestamp + sample.duration
        sample.close()
        const now = performance.now()
        if (now - lastReport > 250) {
          lastReport = now
          onUpdate(Math.min(t / duration, 1))
        }
      }
      return 'done'
    } catch {
      return 'unsupported'
    } finally {
      input?.dispose()
    }
  }

  const viaFFmpeg = async (): Promise<'done' | 'no-audio'> => {
    const rate = 2000
    return withFFmpeg(file, async ({ input, exec, read, remove }) => {
      const out = 'waveform.f32'
      try {
        await exec(buildWaveformArgs(input, out, rate), (t) => onUpdate(Math.min(t / duration, 0.99)))
        const bytes = await read(out)
        // Copia alineada a 4 bytes (el buffer recibido puede empezar en un offset arbitrario).
        const len = Math.floor(bytes.byteLength / 4)
        const samples = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + len * 4))
        accumulate(peaks, samples, len, 0, rate, duration)
        return 'done' as const
      } finally {
        await remove(out)
      }
    })
  }

  const promise = (async (): Promise<'done' | 'no-audio'> => {
    const r = await viaBrowser()
    if (r === 'unsupported') return cancelled ? 'done' : viaFFmpeg()
    return r
  })().then((r) => {
    if (!cancelled) onUpdate(1)
    return r
  })

  return {
    peaks,
    promise,
    cancel: () => {
      cancelled = true
    },
  }
}
