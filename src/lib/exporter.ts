import type { ExportOptions, ExportResult, Segment } from '../store/editorStore'
import { CancelledError, onTerminate, probe, UNDECODABLE_CODECS, withFFmpeg, type ProbeInfo } from './ffmpegClient'
import {
  buildConcatArgs,
  buildConcatList,
  buildCutArgs,
  buildProxyArgs,
  isStreamCopy,
  outputExtension,
} from './ffmpegCommands'
import { getBaseName, getExtension } from './formatUtils'
import { convertSegment } from './webcodecsExporter'

export type ProgressFn = (progress: number, label: string) => void

const MIME: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  webm: 'video/webm',
}

function toBlob(data: Uint8Array, ext: string) {
  return new Blob([data as Uint8Array<ArrayBuffer>], { type: MIME[ext] ?? 'application/octet-stream' })
}

function suffix(opts: ExportOptions) {
  if (opts.format === 'vertical') return opts.verticalMode === 'blur' ? '9x16_blur' : '9x16'
  return isStreamCopy(opts) ? 'original' : 'original_hq'
}

/** ¿Hay que re-codificar con WebCodecs porque ffmpeg.wasm no decodifica este códec? */
export function needsBrowserDecoder(info: ProbeInfo | null, opts: ExportOptions) {
  return !isStreamCopy(opts) && !!info?.videoCodec && UNDECODABLE_CODECS.includes(info.videoCodec)
}

/** Traduce los errores más comunes de FFmpeg a algo comprensible. */
function explain(e: unknown, info: ProbeInfo | null): unknown {
  if (!(e instanceof Error) || e instanceof CancelledError) return e
  if (/Cannot determine format of input stream|Error while decoding|Decoder .* not found/i.test(e.message)) {
    const codec = info?.videoCodec ? ` (${info.videoCodec})` : ''
    return new Error(`El motor de video no pudo decodificar este archivo${codec}.\n\n${e.message}`)
  }
  return e
}

/**
 * Exporta los segmentos en el orden de la lista.
 * - separate: un archivo por segmento.
 * - merge: cada segmento se corta con los mismos parámetros y luego se concatenan sin re-codificar.
 */
export async function exportSegments(
  file: File,
  segments: Segment[],
  opts: ExportOptions,
  info: ProbeInfo | null,
  onProgress: ProgressFn,
): Promise<ExportResult[]> {
  const srcExt = getExtension(file.name)
  const ext = outputExtension(opts, srcExt)
  const base = getBaseName(file.name)
  const tag = suffix(opts)
  const total = segments.reduce((acc, s) => acc + (s.end - s.start), 0)
  const browserDecode = needsBrowserDecoder(info, opts)
  const hasAudio = info?.hasAudio ?? true
  const videoStream = info?.videoStream ?? null

  return withFFmpeg(file, async ({ input, exec, read, write, remove }) => {
    const results: ExportResult[] = []
    const temp: string[] = []
    let done = 0
    const merge = opts.combine === 'merge' && segments.length > 1
    // Al unir dejamos ~5 % del progreso para la concatenación final.
    const scale = merge ? 0.95 : 1

    try {
      for (const [i, seg] of segments.entries()) {
        const n = String(i + 1).padStart(2, '0')
        const dur = seg.end - seg.start
        const out = merge ? `part_${n}.${ext}` : `${base}_clip${n}_${tag}.${ext}`
        const label = `Procesando segmento ${i + 1} de ${segments.length}`
        const report = (segDone: number) => onProgress(((done + Math.min(Math.max(segDone, 0), dur)) / total) * scale, label)
        report(0)

        let data: Uint8Array
        if (browserDecode) {
          const job = convertSegment(file, seg.start, seg.end, opts, (p) => report(p * dur))
          const off = onTerminate(job.cancel)
          try {
            data = await job.promise
          } catch (e) {
            // Tras cancelar, mediabunny lanza su propio error: lo unificamos.
            if (e instanceof Error && /cancel/i.test(e.name + e.message)) throw new CancelledError()
            throw e
          } finally {
            off()
          }
          if (merge) await write(out, data)
        } else {
          await exec(buildCutArgs({ input, output: out, start: seg.start, end: seg.end, hasAudio, videoStream }, opts), report)
          data = merge ? new Uint8Array() : await read(out)
          if (!merge) await remove(out)
        }
        done += dur

        if (merge) {
          temp.push(out)
        } else {
          const blob = toBlob(data, ext)
          results.push({ name: out, url: URL.createObjectURL(blob), size: blob.size })
        }
      }

      if (merge) {
        onProgress(0.96, 'Uniendo segmentos')
        const list = 'concat.txt'
        await write(list, buildConcatList(temp))
        temp.push(list)
        const out = `${base}_unido_${tag}.${ext}`
        temp.push(out)
        await exec(buildConcatArgs(list, out, ext === 'mp4'))
        const data = await read(out)
        const blob = toBlob(data, ext)
        results.push({ name: out, url: URL.createObjectURL(blob), size: blob.size })
      }

      onProgress(1, 'Listo')
      return results
    } catch (e) {
      results.forEach((r) => URL.revokeObjectURL(r.url))
      throw explain(e, info)
    } finally {
      for (const f of temp) await remove(f)
    }
  })
}

/** Genera un MP4 ligero para previsualizar formatos que el navegador no puede reproducir. */
export async function buildPreviewProxy(file: File, info: ProbeInfo | null, onProgress: (p: number) => void) {
  return withFFmpeg(file, async ({ input, exec, read, remove }) => {
    const out = 'preview_proxy.mp4'
    try {
      await exec(buildProxyArgs(input, out, info?.hasAudio ?? true, info?.videoStream ?? null), (t) => {
        if (info?.duration) onProgress(Math.min(t / info.duration, 1))
      })
      const data = await read(out)
      return URL.createObjectURL(toBlob(data, 'mp4'))
    } finally {
      await remove(out)
    }
  })
}

export { probe }
