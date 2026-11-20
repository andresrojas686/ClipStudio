export const ACCEPTED_EXTENSIONS = ['mp4', 'mov', 'avi', 'mkv', 'webm'] as const
export const SIZE_WARNING_BYTES = 500 * 1024 * 1024
export const MIN_SEGMENT_SECONDS = 0.1

export function getExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export function getBaseName(name: string): string {
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  // Nombre seguro para archivos descargados.
  return base.replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/_+/g, '_').slice(0, 60) || 'video'
}

export type FileCheck =
  | { ok: false; error: string }
  | { ok: true; warning?: string }

export function checkFile(file: File): FileCheck {
  const ext = getExtension(file.name)
  if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) {
    return {
      ok: false,
      error: `Formato no soportado (.${ext || '?'}). Usa ${ACCEPTED_EXTENSIONS.map((e) => e.toUpperCase()).join(', ')}.`,
    }
  }
  if (file.size === 0) return { ok: false, error: 'El archivo está vacío.' }
  if (file.size > SIZE_WARNING_BYTES) {
    return {
      ok: true,
      warning: `El archivo pesa ${formatBytes(file.size)}. Por encima de ${formatBytes(SIZE_WARNING_BYTES)} el navegador puede quedarse sin memoria o ir muy lento al exportar.`,
    }
  }
  return { ok: true }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`
}

/** 75.25 → "01:15.2" (o "1:01:15.2" si pasa de una hora). */
export function formatTime(seconds: number, decimals = 1): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const factor = 10 ** decimals
  const total = Math.floor(seconds * factor + 1e-6) / factor
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const sStr = s.toFixed(decimals).padStart(decimals > 0 ? 3 + decimals : 2, '0')
  const mStr = String(m).padStart(2, '0')
  return h > 0 ? `${h}:${mStr}:${sStr}` : `${mStr}:${sStr}`
}

/** Acepta "75", "75.5", "1:15", "1:15.5", "0:01:15.5" (coma o punto decimal). */
export function parseTime(text: string): number | null {
  const clean = text.trim().replace(',', '.')
  if (!clean) return null
  const parts = clean.split(':')
  if (parts.length > 3) return null
  let total = 0
  for (const p of parts) {
    if (!/^\d+(\.\d+)?$/.test(p)) return null
    total = total * 60 + Number(p)
  }
  return total
}

/** Segundos con precisión de milisegundo para argumentos de FFmpeg. */
export function ffTime(seconds: number): string {
  return Math.max(0, seconds).toFixed(3)
}

/** Paso de marcas de la regla para que haya ~10 divisiones visibles. */
export function rulerStep(duration: number): number {
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600]
  return steps.find((s) => duration / s <= 10) ?? 7200
}
