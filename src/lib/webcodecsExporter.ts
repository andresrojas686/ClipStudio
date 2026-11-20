import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  type ConversionVideoOptions,
  type VideoSample,
} from 'mediabunny'
import type { ExportOptions } from '../store/editorStore'
import { VERTICAL_H, VERTICAL_W } from './ffmpegCommands'

/**
 * Re-codificación con las APIs nativas del navegador (WebCodecs) vía mediabunny.
 * Se usa para códecs que el núcleo de ffmpeg.wasm no sabe decodificar (AV1): el navegador sí lo decodifica,
 * y además codifica H.264 por hardware cuando está disponible.
 * Salida: MP4 H.264 (+ audio AAC, copiado si la fuente ya es AAC).
 */

export function webCodecsAvailable() {
  return typeof VideoDecoder !== 'undefined' && typeof VideoEncoder !== 'undefined'
}

/** Compone el modo "fondo desenfocado" en un canvas de 1080×1920. */
function makeBlurPad() {
  const canvas = new OffscreenCanvas(VERTICAL_W, VERTICAL_H)
  const ctx = canvas.getContext('2d')!
  // El fondo se dibuja a 1/4 de resolución con desenfoque y se amplía: mismo aspecto, mucho más barato.
  const small = new OffscreenCanvas(VERTICAL_W / 4, VERTICAL_H / 4)
  const sctx = small.getContext('2d')!
  sctx.filter = 'blur(6px)'

  return (sample: VideoSample) => {
    const w = sample.displayWidth
    const h = sample.displayHeight
    // Fondo: "cover" en el canvas pequeño.
    const cover = Math.max(small.width / w, small.height / h)
    const cw = w * cover
    const ch = h * cover
    sctx.drawImage(sample.toCanvasImageSource(), (small.width - cw) / 2, (small.height - ch) / 2, cw, ch)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(small, 0, 0, VERTICAL_W, VERTICAL_H)
    // Frente: "contain" centrado.
    const contain = Math.min(VERTICAL_W / w, VERTICAL_H / h)
    const fw = Math.round((w * contain) / 2) * 2
    const fh = Math.round((h * contain) / 2) * 2
    sample.draw(ctx, (VERTICAL_W - fw) / 2, (VERTICAL_H - fh) / 2, fw, fh)
    return canvas
  }
}

function videoOptions(opts: ExportOptions): ConversionVideoOptions {
  const base: ConversionVideoOptions = { codec: 'avc', quality: QUALITY_HIGH, forceTranscode: true }
  if (opts.format === 'original') return base
  if (opts.verticalMode === 'crop') return { ...base, width: VERTICAL_W, height: VERTICAL_H, fit: 'cover' }
  return { ...base, process: makeBlurPad(), processedWidth: VERTICAL_W, processedHeight: VERTICAL_H }
}

export interface WebCodecsJob {
  promise: Promise<Uint8Array>
  cancel: () => void
}

/** Corta y convierte un segmento. `onProgress` recibe 0–1. */
export function convertSegment(
  file: File,
  start: number,
  end: number,
  opts: ExportOptions,
  onProgress: (p: number) => void,
): WebCodecsJob {
  let conversion: Conversion | null = null
  let cancelled = false

  const promise = (async () => {
    if (!webCodecsAvailable()) {
      throw new Error('Este navegador no soporta WebCodecs. Usa Chrome o Edge actualizados para este video.')
    }
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
    try {
      const track = await input.getPrimaryVideoTrack()
      if (!track) throw new Error('El archivo no tiene pista de video.')
      if (!(await track.canDecode())) {
        throw new Error(`Este navegador no puede decodificar el video (${track.codec ?? 'códec desconocido'}).`)
      }
      const target = new BufferTarget()
      const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target })
      conversion = await Conversion.init({
        input,
        output,
        tracks: 'primary',
        trim: { start, end },
        video: videoOptions(opts),
        audio: { codec: 'aac' },
        showWarnings: false,
      })
      if (!conversion.isValid) {
        const why = conversion.discardedTracks.map((d) => `${d.track.type}: ${d.reason}`).join(', ')
        throw new Error(`No se puede convertir este video en el navegador (${why}).`)
      }
      if (cancelled) await conversion.cancel()
      conversion.onProgress = (p) => onProgress(p)
      await conversion.execute()
      if (!target.buffer) throw new Error('La conversión no produjo datos.')
      return new Uint8Array(target.buffer)
    } finally {
      input.dispose()
    }
  })()

  return {
    promise,
    cancel: () => {
      cancelled = true
      void conversion?.cancel()
    },
  }
}
