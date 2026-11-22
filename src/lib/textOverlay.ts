/** Cajas de texto sobre el video (Fase 2.7). */

export type FontId = 'sans' | 'montserrat' | 'serif' | 'mono' | 'impact'
export type TextAlign = 'left' | 'center' | 'right'
export type TextBg = 'none' | 'box' | 'outline'

export interface TextOverlay {
  id: string
  /** Admite saltos de línea. */
  text: string
  /** Segundos sobre el video original. */
  start: number
  end: number
  /** Esquina superior izquierda de la caja, normalizada (0–1) al cuadro de salida. */
  x: number
  y: number
  /** Ancho de la caja (0–1 del ancho de salida); el texto se ajusta a este ancho. */
  w: number
  /** Alto de la letra relativo al alto del cuadro de salida (p. ej. 0.05). */
  size: number
  font: FontId
  bold: boolean
  align: TextAlign
  color: string
  bg: TextBg
  bgColor: string
}

export const FONTS: { id: FontId; label: string; family: string }[] = [
  { id: 'montserrat', label: 'Montserrat', family: "'ClipMontserrat', 'Arial', sans-serif" },
  { id: 'sans', label: 'Arial', family: "Arial, Helvetica, sans-serif" },
  { id: 'impact', label: 'Impact', family: "Impact, 'Arial Black', sans-serif" },
  { id: 'serif', label: 'Georgia', family: "Georgia, 'Times New Roman', serif" },
  { id: 'mono', label: 'Courier', family: "'Courier New', Courier, monospace" },
]

export const fontFamily = (id: FontId) => FONTS.find((f) => f.id === id)?.family ?? FONTS[0].family

export const MIN_TEXT_SECONDS = 0.1
export const MIN_TEXT_WIDTH = 0.08
export const MIN_TEXT_SIZE = 0.015
export const MAX_TEXT_SIZE = 0.3

let counter = 0

/** Texto nuevo en el instante `t`, durante 3 s, centrado en la parte baja. */
export function defaultText(t: number, duration: number): TextOverlay {
  const start = Math.min(Math.max(0, t), Math.max(0, duration - MIN_TEXT_SECONDS))
  return {
    id: `txt-${Date.now().toString(36)}-${counter++}`,
    text: 'Tu texto aquí',
    start: Math.round(start * 1000) / 1000,
    end: Math.round(Math.min(duration, start + 3) * 1000) / 1000,
    x: 0.1,
    y: 0.72,
    w: 0.8,
    size: 0.05,
    font: 'montserrat',
    bold: true,
    align: 'center',
    color: '#ffffff',
    bg: 'box',
    bgColor: '#000000',
  }
}

export const isActiveAt = (t: TextOverlay, time: number) => time >= t.start && time < t.end

/** ¿El texto se ve en algún momento del tramo [start, end)? */
export const touchesRange = (t: TextOverlay, start: number, end: number) => t.start < end && t.end > start && t.text.trim() !== ''
