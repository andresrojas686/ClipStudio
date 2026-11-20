import type { ExportOptions, ExportResult, Segment } from '../store/editorStore'
import { probe, withFFmpeg } from './ffmpegClient'
import {
  buildConcatArgs,
  buildConcatList,
  buildCutArgs,
  buildProxyArgs,
  isStreamCopy,
  outputExtension,
} from './ffmpegCommands'
import { getBaseName, getExtension } from './formatUtils'

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

/**
 * Exporta los segmentos en el orden de la lista.
 * - separate: un archivo por segmento.
 * - merge: cada segmento se corta con los mismos parámetros y luego se concatenan sin re-codificar.
 */
export async function exportSegments(
  file: File,
  segments: Segment[],
  opts: ExportOptions,
  hasAudio: boolean,
  onProgress: ProgressFn,
): Promise<ExportResult[]> {
  const srcExt = getExtension(file.name)
  const ext = outputExtension(opts, srcExt)
  const base = getBaseName(file.name)
  const tag = suffix(opts)
  const total = segments.reduce((acc, s) => acc + (s.end - s.start), 0)

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
        onProgress((done / total) * scale, label)

        await exec(buildCutArgs({ input, output: out, start: seg.start, end: seg.end, hasAudio }, opts), (t) => {
          onProgress(((done + Math.min(Math.max(t, 0), dur)) / total) * scale, label)
        })
        done += dur

        if (merge) {
          temp.push(out)
        } else {
          const data = await read(out)
          await remove(out)
          const blob = toBlob(data, ext)
          results.push({ name: out, url: URL.createObjectURL(blob), size: blob.size })
        }
      }

      if (merge) {
        onProgress(0.96, 'Uniendo segmentos')
        const list = 'concat.txt'
        temp.push(list)
        await write(list, buildConcatList(temp.filter((f) => f !== list)))
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
      throw e
    } finally {
      for (const f of temp) await remove(f)
    }
  })
}

/** Genera un MP4 ligero para previsualizar formatos que el navegador no puede reproducir. */
export async function buildPreviewProxy(file: File, hasAudio: boolean, duration: number | null, onProgress: (p: number) => void) {
  return withFFmpeg(file, async ({ input, exec, read, remove }) => {
    const out = 'preview_proxy.mp4'
    try {
      await exec(buildProxyArgs(input, out, hasAudio), (t) => {
        if (duration) onProgress(Math.min(t / duration, 1))
      })
      const data = await read(out)
      return URL.createObjectURL(toBlob(data, 'mp4'))
    } finally {
      await remove(out)
    }
  })
}

export { probe }
