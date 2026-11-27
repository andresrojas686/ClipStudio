/** Ajustes de exportación y presets por red social. */

export type Aspect = 'original' | '9:16' | '1:1' | '4:5' | '16:9' | 'free'
export type FitMode = 'crop' | 'blur'
export type Rotation = 0 | 90 | 180 | 270
/** Lado corto de la salida en píxeles, o 'source' para no escalar. */
export type Resolution = 'source' | 480 | 720 | 1080 | 1440 | 2160
/** Mbps de video, o 'auto' para calidad constante. */
export type Bitrate = 'auto' | 2 | 4 | 6 | 8 | 12 | 16
export type CutMode = 'fast' | 'precise'
export type CombineMode = 'separate' | 'merge'
/** Velocidad de reproducción del corto exportado (1 = normal). */
export type Speed = 0.25 | 0.5 | 0.75 | 1 | 1.25 | 1.5 | 1.75 | 2

export const SPEEDS: Speed[] = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

/** 1.5 → "1,5×" (coma decimal). */
export const formatSpeed = (s: number) => `${String(s).replace('.', ',')}×`

export interface ExportSettings {
  presetId: string
  aspect: Aspect
  fit: FitMode
  rotation: Rotation
  resolution: Resolution
  bitrate: Bitrate
  cutMode: CutMode
  combine: CombineMode
  speed: Speed
}

/** Encuadre normalizado (0–1) sobre el video ya rotado. */
export interface CropRect {
  x: number
  y: number
  w: number
  h: number
}

export interface Preset {
  id: string
  name: string
  hint: string
  aspect: Aspect
  fit: FitMode
  resolution: Resolution
  bitrate: Bitrate
}

export const PRESETS: Preset[] = [
  { id: 'original', name: 'Original', hint: 'Mismo encuadre y resolución', aspect: 'original', fit: 'crop', resolution: 'source', bitrate: 'auto' },
  { id: 'tiktok', name: 'TikTok', hint: '9:16 · 1080×1920', aspect: '9:16', fit: 'crop', resolution: 1080, bitrate: 'auto' },
  { id: 'reels', name: 'Instagram Reels', hint: '9:16 · 1080×1920', aspect: '9:16', fit: 'crop', resolution: 1080, bitrate: 'auto' },
  { id: 'shorts', name: 'YouTube Shorts', hint: '9:16 · 1080×1920', aspect: '9:16', fit: 'crop', resolution: 1080, bitrate: 'auto' },
  { id: 'stories', name: 'Instagram Stories', hint: '9:16 · fondo desenfocado', aspect: '9:16', fit: 'blur', resolution: 1080, bitrate: 'auto' },
  { id: 'feed', name: 'Instagram Feed', hint: '4:5 · 1080×1350', aspect: '4:5', fit: 'crop', resolution: 1080, bitrate: 'auto' },
  { id: 'square', name: 'Cuadrado', hint: '1:1 · 1080×1080', aspect: '1:1', fit: 'crop', resolution: 1080, bitrate: 'auto' },
  { id: 'youtube', name: 'YouTube', hint: '16:9 · 1920×1080', aspect: '16:9', fit: 'crop', resolution: 1080, bitrate: 'auto' },
]

export const CUSTOM_PRESET_ID = 'custom'

export function presetName(id: string) {
  return PRESETS.find((p) => p.id === id)?.name ?? 'Personalizado'
}

export const DEFAULT_SETTINGS: ExportSettings = {
  presetId: 'tiktok',
  aspect: '9:16',
  fit: 'crop',
  rotation: 0,
  resolution: 1080,
  bitrate: 'auto',
  cutMode: 'precise',
  combine: 'separate',
  speed: 1,
}

export function applyPreset(settings: ExportSettings, preset: Preset): ExportSettings {
  const { aspect, fit, resolution, bitrate } = preset
  return { ...settings, presetId: preset.id, aspect, fit, resolution, bitrate }
}

/** Proporción numérica (ancho/alto) de un aspecto fijo. */
export function aspectRatio(aspect: Aspect): number | null {
  switch (aspect) {
    case '9:16':
      return 9 / 16
    case '1:1':
      return 1
    case '4:5':
      return 4 / 5
    case '16:9':
      return 16 / 9
    default:
      return null
  }
}

/** ¿La exportación puede copiar los streams sin re-codificar? */
export function isPassThrough(s: ExportSettings) {
  return s.aspect === 'original' && s.rotation === 0 && s.resolution === 'source' && s.bitrate === 'auto' && s.speed === 1
}

export function isStreamCopy(s: ExportSettings) {
  return isPassThrough(s) && s.cutMode === 'fast'
}

/** ¿El modo usa el encuadre manual? (con fondo desenfocado se muestra el cuadro completo) */
export function usesCrop(s: ExportSettings) {
  return s.aspect !== 'original' && s.fit === 'crop'
}
