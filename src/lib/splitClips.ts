/** Reparto de un video en N clips de igual duración (Fase 2.5). */

export const MAX_CLIPS = 200
/** Duración mínima de cada clip al dividir. */
export const MIN_CLIP_SECONDS = 1

export interface ClipRange {
  start: number
  end: number
}

/** Máximo de clips posible para una duración (cada clip ≥ MIN_CLIP_SECONDS). */
export function maxClipsFor(duration: number) {
  return Math.max(1, Math.min(MAX_CLIPS, Math.floor(duration / MIN_CLIP_SECONDS)))
}

const ms = (n: number) => Math.round(n * 1000) / 1000

/**
 * Divide [0, duration] en `count` tramos consecutivos de igual duración, con precisión de milisegundo.
 * Los límites se calculan desde el inicio (no acumulando) para que no se arrastre error,
 * y el último tramo termina exactamente en `duration`.
 */
export function splitEvenly(duration: number, count: number): ClipRange[] {
  const n = Math.min(Math.max(1, Math.floor(count)), maxClipsFor(duration))
  if (!(duration > 0)) return []
  const bounds = Array.from({ length: n + 1 }, (_, i) => (i === n ? duration : ms((i * duration) / n)))
  return Array.from({ length: n }, (_, i) => ({ start: bounds[i], end: bounds[i + 1] }))
}
