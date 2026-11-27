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

/** Imagen (PNG) superpuesta en el cuadro de salida entre `start` y `end` (segundos del clip). */
export interface ImageOverlay {
  file: string
  x: number
  y: number
  start: number
  end: number
}

/**
 * Añade los textos (PNG, entradas 1..N) sobre la salida de `chain` (que termina en [v]).
 * Cada uno se muestra solo en su tramo con `enable=between(t,a,b)`.
 */
function withOverlays(chain: string, overlays: ImageOverlay[]): string {
  if (!overlays.length) return chain
  let out = chain.replace(/\[v\]$/, '[v0]')
  overlays.forEach((o, i) => {
    const last = i === overlays.length - 1
    const enable = `between(t,${o.start.toFixed(3)},${o.end.toFixed(3)})`
    out += `;[v${i}][${i + 1}:v]overlay=${o.x}:${o.y}:enable='${enable}'${last ? ',format=yuv420p[v]' : `[v${i + 1}]`}`
  })
  return out
}

/**
 * Cadena de filtros de video para la geometría pedida, los textos y la velocidad. Termina en la etiqueta [v].
 * El cambio de velocidad va al final: los `enable` de los textos siguen en tiempo del clip original.
 */
export function videoFilter(geo: OutputGeometry, videoStream: number | null, overlays: ImageOverlay[] = [], speed = 1): string {
  const chain = withOverlays(baseVideoFilter(geo, videoStream), overlays)
  return speed === 1 ? chain : chain.replace(/\[v\]$/, `,${setptsFilter(speed)}[v]`)
}

const setptsFilter = (speed: number) => `setpts=PTS/${speed}`

/**
 * Cambio de tempo del audio sin alterar el tono. `atempo` admite de 0,5 a 2 por instancia en esta versión de
 * FFmpeg, así que 0,25× se consigue encadenando dos.
 */
export function atempoChain(speed: number): string {
  const parts: number[] = []
  let rest = speed
  while (rest < 0.5) {
    parts.push(0.5)
    rest /= 0.5
  }
  while (rest > 2) {
    parts.push(2)
    rest /= 2
  }
  parts.push(rest)
  return parts.map((p) => `atempo=${Number(p.toFixed(4))}`).join(',')
}

function baseVideoFilter(geo: OutputGeometry, videoStream: number | null): string {
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
export function buildCutArgs(spec: CutSpec, settings: ExportSettings, geo: OutputGeometry, overlays: ImageOverlay[] = []): string[] {
  const { input, output, start, end, hasAudio, videoStream } = spec
  const seek = ['-ss', ffTime(start), '-i', input]
  // Copia sin re-codificar (solo a 1×): `-t` como opción de salida.
  const duration = ['-t', ffTime(end - start)]
  const audioMap = hasAudio ? ['-map', '0:a:0'] : []

  if (isStreamCopy(settings)) {
    // Sin re-codificar: instantáneo, pero el corte cae en el keyframe anterior.
    return [...seek, ...duration, '-map', videoMap(videoStream), ...audioMap, '-c', 'copy', '-avoid_negative_ts', 'make_zero', output]
  }

  const audio = hasAudio ? AAC : ['-an']
  const speed = settings.speed
  // Al re-codificar, `-t` va como opción de ENTRADA del video: limita lo leído del original y la salida dura
  // `duración / velocidad` sola (como opción de salida cortaría el resultado ya acelerado o ralentizado).
  const speedAudio = hasAudio && speed !== 1
  const filter = videoFilter(geo, videoStream, overlays, speed) + (speedAudio ? `;[0:a:0]${atempoChain(speed)}[a]` : '')
  return [
    '-ss', ffTime(start), '-t', ffTime(end - start), '-i', input,
    // Las imágenes de texto van después: `-ss`/`-t` solo afectan a la entrada 0 (el video).
    ...overlays.flatMap((o) => ['-i', o.file]),
    '-filter_complex', filter,
    '-map', '[v]', ...(speedAudio ? ['-map', '[a]'] : audioMap),
    ...X264, ...rateArgs(settings.bitrate), ...audio, ...MP4,
    output,
  ]
}

/** Cambia la velocidad de un clip ya cortado (segundo paso de la vía WebCodecs). */
export function buildSpeedArgs(input: string, output: string, speed: number, hasAudio: boolean, bitrate: Bitrate): string[] {
  const filter = `[0:v:0]${setptsFilter(speed)}[v]` + (hasAudio ? `;[0:a:0]${atempoChain(speed)}[a]` : '')
  return [
    '-i', input,
    '-filter_complex', filter,
    '-map', '[v]', ...(hasAudio ? ['-map', '[a]'] : []),
    ...X264, ...rateArgs(bitrate), ...(hasAudio ? AAC : ['-an']), ...MP4,
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
