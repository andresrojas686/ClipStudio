import { aspectRatio, isStreamCopy, usesCrop, type CropRect, type ExportSettings, type Rotation } from './presets'

/** Dimensiones tras aplicar la rotación elegida. */
export function rotatedSize(w: number, h: number, rotation: Rotation) {
  return rotation === 90 || rotation === 270 ? { w: h, h: w } : { w, h }
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)

/** Encuadre más grande posible, centrado, con la proporción `ratio` (ancho/alto) sobre un cuadro w×h. */
export function centeredCrop(w: number, h: number, ratio: number | null): CropRect {
  if (!ratio || !w || !h) return { x: 0, y: 0, w: 1, h: 1 }
  const frame = w / h
  if (frame > ratio) {
    const cw = ratio / frame
    return { x: (1 - cw) / 2, y: 0, w: cw, h: 1 }
  }
  const ch = frame / ratio
  return { x: 0, y: (1 - ch) / 2, w: 1, h: ch }
}

export interface OutputGeometry {
  /** 'pass' = sin encuadre (original), 'crop' = recorte manual, 'blur' = fondo desenfocado. */
  mode: 'pass' | 'crop' | 'blur'
  rotation: Rotation
  /** Tamaño del video rotado (fuente). */
  srcW: number
  srcH: number
  /** Recorte en píxeles sobre el video rotado (solo modo 'crop'). */
  crop: { left: number; top: number; width: number; height: number } | null
  outW: number
  outH: number
}

/** Escala (w, h) para que su lado corto mida `short`. */
function scaleToShort(w: number, h: number, short: number) {
  const k = short / Math.min(w, h)
  return { w: even(w * k), h: even(h * k) }
}

/**
 * Calcula recorte y tamaño de salida a partir de los ajustes.
 * `srcW`/`srcH` son las dimensiones de visualización del video original (con su rotación de metadatos aplicada).
 */
export function computeGeometry(
  settings: ExportSettings,
  cropRect: CropRect | null,
  srcW: number,
  srcH: number,
): OutputGeometry {
  const { w: rw, h: rh } = rotatedSize(srcW, srcH, settings.rotation)
  const base = { rotation: settings.rotation, srcW: rw, srcH: rh }
  const res = settings.resolution

  if (settings.aspect === 'original') {
    const size = res === 'source' ? { w: even(rw), h: even(rh) } : scaleToShort(rw, rh, res)
    return { ...base, mode: 'pass', crop: null, outW: size.w, outH: size.h }
  }

  if (usesCrop(settings)) {
    const ratio = aspectRatio(settings.aspect)
    const r = cropRect ?? centeredCrop(rw, rh, ratio)
    const width = even(Math.min(r.w * rw, rw))
    const height = even(Math.min(r.h * rh, rh))
    const left = Math.min(Math.max(0, Math.round(r.x * rw)), rw - width)
    const top = Math.min(Math.max(0, Math.round(r.y * rh)), rh - height)
    // Con proporción fija la salida respeta exactamente esa proporción; en modo libre, la del recorte.
    const outRatio = ratio ?? width / height
    let size: { w: number; h: number }
    if (res === 'source') {
      size = ratio ? fitRatio(width, height, ratio) : { w: width, h: height }
    } else {
      size = outRatio >= 1 ? { w: even(res * outRatio), h: even(res) } : { w: even(res), h: even(res / outRatio) }
    }
    return { ...base, mode: 'crop', crop: { left, top, width, height }, outW: size.w, outH: size.h }
  }

  // Fondo desenfocado: lienzo con la proporción pedida, el video completo encima.
  const ratio = aspectRatio(settings.aspect) ?? rw / rh
  const short = res === 'source' ? Math.min(rw, rh) : res
  const size = ratio >= 1 ? { w: even(short * ratio), h: even(short) } : { w: even(short), h: even(short / ratio) }
  return { ...base, mode: 'blur', crop: null, outW: size.w, outH: size.h }
}

/** Resumen legible de la salida, p. ej. "MP4 · 1080×1920 · H.264 calidad automática + AAC". */
export function describeOutput(
  settings: ExportSettings,
  crop: CropRect | null,
  width: number | null,
  height: number | null,
  sourceExt: string,
) {
  if (isStreamCopy(settings)) return `.${sourceExt} · mismo códec y resolución que el original`
  if (!width || !height) return 'MP4 · H.264 + AAC'
  const g = computeGeometry(settings, crop, width, height)
  const rate = settings.bitrate === 'auto' ? 'calidad automática' : `${settings.bitrate} Mbps`
  return `MP4 · ${g.outW}×${g.outH} · H.264 ${rate} + AAC`
}

/** Ajusta un tamaño en píxeles a una proporción exacta sin agrandarlo. */
function fitRatio(w: number, h: number, ratio: number) {
  return w / h > ratio ? { w: even(h * ratio), h: even(h) } : { w: even(w), h: even(w / ratio) }
}
