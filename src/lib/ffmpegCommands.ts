import type { ExportOptions } from '../store/editorStore'
import { ffTime } from './formatUtils'

/**
 * Constructores de argumentos FFmpeg (funciones puras, sin efectos).
 * Salida re-codificada: siempre MP4 H.264 + AAC, compatible con todas las redes sociales.
 */

export const VERTICAL_W = 1080
export const VERTICAL_H = 1920

/** Preset de x264: en WebAssembly un preset lento hace la exportación eterna. */
const X264 = ['-c:v', 'libx264', '-preset', 'superfast', '-crf', '23', '-pix_fmt', 'yuv420p']
const AAC = ['-c:a', 'aac', '-b:a', '128k', '-ac', '2']
const MP4 = ['-movflags', '+faststart']

/** Recorte central: llena 1080×1920 y corta lo que sobra (sirve para fuentes horizontales y verticales). */
export const CROP_FILTER = `scale=${VERTICAL_W}:${VERTICAL_H}:force_original_aspect_ratio=increase,crop=${VERTICAL_W}:${VERTICAL_H},setsar=1`

/**
 * Blur-pad: fondo con el mismo video ampliado y desenfocado, video completo centrado encima.
 * El desenfoque se hace a 1/4 de resolución y luego se escala: mismo aspecto, mucho más rápido en wasm.
 */
export const BLUR_FILTER =
  `[0:v]split=2[bg][fg];` +
  `[bg]scale=${VERTICAL_W / 4}:${VERTICAL_H / 4}:force_original_aspect_ratio=increase,` +
  `crop=${VERTICAL_W / 4}:${VERTICAL_H / 4},boxblur=10:2,scale=${VERTICAL_W}:${VERTICAL_H}[bg2];` +
  `[fg]scale=${VERTICAL_W}:${VERTICAL_H}:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2[fg2];` +
  `[bg2][fg2]overlay=(W-w)/2:(H-h)/2,setsar=1[v]`

/** Ajusta dimensiones impares a pares (requisito de yuv420p). */
const EVEN_FILTER = 'scale=trunc(iw/2)*2:trunc(ih/2)*2'

export interface CutSpec {
  input: string
  output: string
  start: number
  end: number
  hasAudio: boolean
}

/** ¿La exportación conserva el contenedor original (copia de streams) o produce MP4? */
export function isStreamCopy(opts: ExportOptions) {
  return opts.format === 'original' && opts.cutMode === 'fast'
}

export function outputExtension(opts: ExportOptions, sourceExt: string) {
  return isStreamCopy(opts) ? sourceExt : 'mp4'
}

/** Argumentos para cortar (y convertir) un segmento. `-ss` va antes de `-i` para buscar rápido. */
export function buildCutArgs(spec: CutSpec, opts: ExportOptions): string[] {
  const { input, output, start, end, hasAudio } = spec
  const seek = ['-ss', ffTime(start), '-i', input, '-t', ffTime(end - start)]
  const audioMap = hasAudio ? ['-map', '0:a:0'] : []

  if (isStreamCopy(opts)) {
    // Sin re-codificar: instantáneo, pero el corte cae en el keyframe anterior.
    return [...seek, '-map', '0:v:0', ...audioMap, '-c', 'copy', '-avoid_negative_ts', 'make_zero', output]
  }

  const audio = hasAudio ? AAC : ['-an']

  if (opts.format === 'vertical' && opts.verticalMode === 'blur') {
    return [...seek, '-filter_complex', BLUR_FILTER, '-map', '[v]', ...audioMap, ...X264, ...audio, ...MP4, output]
  }

  const vf = opts.format === 'vertical' ? CROP_FILTER : EVEN_FILTER
  return [...seek, '-map', '0:v:0', ...audioMap, '-vf', vf, ...X264, ...audio, ...MP4, output]
}

/** Contenido del archivo de lista para el demuxer concat. */
export function buildConcatList(files: string[]) {
  return files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n') + '\n'
}

/** Une segmentos ya codificados con parámetros idénticos, sin re-codificar. */
export function buildConcatArgs(listPath: string, output: string, mp4: boolean): string[] {
  return ['-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', ...(mp4 ? MP4 : []), output]
}

/** Proxy de vista previa (H.264 480p) para formatos que el navegador no reproduce. */
export function buildProxyArgs(input: string, output: string, hasAudio: boolean): string[] {
  return [
    '-i', input,
    '-map', '0:v:0',
    ...(hasAudio ? ['-map', '0:a:0', '-c:a', 'aac', '-b:a', '96k', '-ac', '2'] : ['-an']),
    '-vf', 'scale=-2:480',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '30', '-pix_fmt', 'yuv420p',
    ...MP4,
    output,
  ]
}
