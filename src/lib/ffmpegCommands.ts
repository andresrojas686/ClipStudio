import type { OutputGeometry } from './geometry'
import { isStreamCopy, type Bitrate, type ExportSettings } from './presets'
import { ffTime } from './formatUtils'

/**
 * Constructores de argumentos FFmpeg (funciones puras, sin efectos).
 * Salida re-codificada: siempre MP4 H.264 + AAC, compatible con todas las redes sociales.
 */

/** Preset de x264: en WebAssembly un preset lento hace la exportación eterna. */
const X264 = ['-c:v', 'libx264', '-preset', 'superfast', '-pix_fmt', 'yuv420p']
const AAC = ['-c:a', 'aac', '-b:a', '128k', '-ac', '2']
const MP4 = ['-movflags', '+faststart']

/** Control de calidad: CRF constante, o bitrate objetivo con techo. */
export function rateArgs(bitrate: Bitrate): string[] {
  if (bitrate === 'auto') return ['-crf', '23']
  return ['-b:v', `${bitrate}M`, '-maxrate', `${bitrate * 1.5}M`, '-bufsize', `${bitrate * 2}M`]
}

/** Selector del stream de video para -map / filtros. */
const videoMap = (videoStream: number | null) => (videoStream === null ? '0:v:0' : `0:${videoStream}`)

/** Filtro de rotación (sentido horario). */
export function rotateFilter(rotation: number): string | null {
  switch (rotation) {
    case 90:
      return 'transpose=1'
    case 180:
      return 'hflip,vflip'
    case 270:
      return 'transpose=2'
    default:
      return null
  }
}

/** Cadena de filtros de video para la geometría pedida. Termina en la etiqueta [v]. */
export function videoFilter(geo: OutputGeometry, videoStream: number | null): string {
  const { outW: W, outH: H } = geo
  const pre = [rotateFilter(geo.rotation)].filter(Boolean) as string[]
  const src = `[${videoMap(videoStream)}]`

  if (geo.mode === 'blur') {
    const bw = Math.round(W / 8) * 2
    const bh = Math.round(H / 8) * 2
    const head = pre.length ? `${src}${pre.join(',')},split=2[bg][fg]` : `${src}split=2[bg][fg]`
    return (
      `${head};` +
      // Fondo a 1/4 de resolución con desenfoque y luego ampliado: mismo aspecto, mucho más rápido en wasm.
      `[bg]scale=${bw}:${bh}:force_original_aspect_ratio=increase,crop=${bw}:${bh},boxblur=10:2,scale=${W}:${H}[bg2];` +
      `[fg]scale=${W}:${H}:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2[fg2];` +
      `[bg2][fg2]overlay=(W-w)/2:(H-h)/2,setsar=1[v]`
    )
  }

  const chain = [...pre]
  if (geo.mode === 'crop' && geo.crop) {
    const c = geo.crop
    chain.push(`crop=${c.width}:${c.height}:${c.left}:${c.top}`)
  }
  chain.push(`scale=${W}:${H}`, 'setsar=1')
  return `${src}${chain.join(',')}[v]`
}

export interface CutSpec {
  input: string
  output: string
  start: number
  end: number
  hasAudio: boolean
  /** Índice absoluto del stream de video (null = el primero). */
  videoStream: number | null
}

export function outputExtension(settings: ExportSettings, sourceExt: string) {
  return isStreamCopy(settings) ? sourceExt : 'mp4'
}

/** Argumentos para cortar (y convertir) un segmento. `-ss` va antes de `-i` para buscar rápido. */
export function buildCutArgs(spec: CutSpec, settings: ExportSettings, geo: OutputGeometry): string[] {
  const { input, output, start, end, hasAudio, videoStream } = spec
  const seek = ['-ss', ffTime(start), '-i', input, '-t', ffTime(end - start)]
  const audioMap = hasAudio ? ['-map', '0:a:0'] : []

  if (isStreamCopy(settings)) {
    // Sin re-codificar: instantáneo, pero el corte cae en el keyframe anterior.
    return [...seek, '-map', videoMap(videoStream), ...audioMap, '-c', 'copy', '-avoid_negative_ts', 'make_zero', output]
  }

  const audio = hasAudio ? AAC : ['-an']
  return [
    ...seek,
    '-filter_complex', videoFilter(geo, videoStream),
    '-map', '[v]', ...audioMap,
    ...X264, ...rateArgs(settings.bitrate), ...audio, ...MP4,
    output,
  ]
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
export function buildProxyArgs(input: string, output: string, hasAudio: boolean, videoStream: number | null): string[] {
  return [
    '-i', input,
    '-map', videoMap(videoStream),
    ...(hasAudio ? ['-map', '0:a:0', '-c:a', 'aac', '-b:a', '96k', '-ac', '2'] : ['-an']),
    '-vf', 'scale=-2:480',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '30', '-pix_fmt', 'yuv420p',
    ...MP4,
    output,
  ]
}

/** Extrae audio mono a baja frecuencia (PCM float) para dibujar la forma de onda. */
export function buildWaveformArgs(input: string, output: string, sampleRate: number): string[] {
  return ['-i', input, '-map', '0:a:0', '-vn', '-ac', '1', '-ar', String(sampleRate), '-f', 'f32le', output]
}
