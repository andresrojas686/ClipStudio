import { create } from 'zustand'
import type { ProbeInfo } from '../lib/ffmpegClient'
import { MIN_SEGMENT_SECONDS } from '../lib/formatUtils'
import {
  applyPreset,
  CUSTOM_PRESET_ID,
  DEFAULT_SETTINGS,
  type CropRect,
  type ExportSettings,
  type Preset,
} from '../lib/presets'

export interface Segment {
  id: string
  start: number
  end: number
}

export type { CropRect, ExportSettings } from '../lib/presets'

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface ExportResult {
  name: string
  url: string
  size: number
}

export type JobStatus = 'pending' | 'running' | 'done' | 'error' | 'cancelled'

/** Trabajo de la cola: copia de ajustes, encuadre y segmentos en el momento de añadirlo. */
export interface QueueJob {
  id: string
  settings: ExportSettings
  crop: CropRect | null
  segments: Segment[]
  status: JobStatus
  progress: number
  label: string
  results: ExportResult[]
  error: string | null
}

interface EditorState {
  // Video fuente
  file: File | null
  /** De dónde vino el archivo: 'youtube' habilita "Guardar original" (solo está en memoria). */
  fileSource: 'local' | 'youtube'
  previewUrl: string | null
  isProxy: boolean
  proxyState: 'none' | 'building' | 'failed'
  proxyProgress: number
  duration: number
  info: ProbeInfo | null

  // Reproductor
  videoEl: HTMLVideoElement | null
  currentTime: number
  playing: boolean
  playUntil: number | null

  // Segmentos
  segments: Segment[]
  selectedId: string | null
  markIn: number | null
  notice: string | null
  /** Diálogo "Dividir en N clips" abierto. */
  splitOpen: boolean

  // Motor y exportación
  engine: EngineStatus
  engineError: string | null
  settings: ExportSettings
  /** Encuadre manual; null = centrado automático. */
  crop: CropRect | null
  queue: QueueJob[]
  queueRunning: boolean

  setFile: (file: File | null, source?: 'local' | 'youtube') => void
  setPreview: (url: string, isProxy: boolean) => void
  setProxyState: (s: EditorState['proxyState'], progress?: number) => void
  setDuration: (d: number) => void
  setInfo: (info: ProbeInfo) => void
  setVideoEl: (el: HTMLVideoElement | null) => void
  setCurrentTime: (t: number) => void
  setPlaying: (p: boolean) => void
  seek: (t: number) => void
  togglePlay: () => void
  playRange: (start: number, end: number) => void

  setMarkIn: () => void
  markOut: () => void
  addSegmentAtPlayhead: () => void
  updateSegment: (id: string, start: number, end: number) => string | null
  removeSegment: (id: string) => void
  moveSegment: (id: string, dir: -1 | 1) => void
  selectSegment: (id: string | null) => void
  setNotice: (msg: string | null) => void
  /** Sustituye todos los segmentos por estos tramos (en orden). */
  replaceSegments: (ranges: { start: number; end: number }[]) => void
  setSplitOpen: (open: boolean) => void

  setEngine: (s: EngineStatus, error?: string | null) => void
  /** Cambia ajustes; si no es un preset, pasa a "Personalizado". */
  setSettings: (patch: Partial<ExportSettings>) => void
  choosePreset: (preset: Preset) => void
  setCrop: (crop: CropRect | null) => void
  /** Añade un trabajo con los ajustes y segmentos actuales; devuelve su id (o null si no hay segmentos). */
  enqueue: () => string | null
  updateJob: (id: string, patch: Partial<QueueJob>) => void
  removeJob: (id: string) => void
  clearFinished: () => void
  setQueueRunning: (v: boolean) => void
}

let idCounter = 0
const newId = () => `seg-${Date.now().toString(36)}-${idCounter++}`

const round3 = (n: number) => Math.round(n * 1000) / 1000

/** Comprueba que [start, end] no pise otros segmentos (ignorando `ignoreId`). */
function overlaps(segments: Segment[], start: number, end: number, ignoreId?: string) {
  return segments.some((s) => s.id !== ignoreId && start < s.end - 1e-6 && end > s.start + 1e-6)
}

/** Hueco libre (por tiempo) que contiene `t`, o null si `t` cae dentro de un segmento. */
function freeGapAt(segments: Segment[], t: number, duration: number) {
  let lo = 0
  let hi = duration
  for (const s of segments) {
    if (t >= s.start && t < s.end) return null
    if (s.end <= t) lo = Math.max(lo, s.end)
    if (s.start > t) hi = Math.min(hi, s.start)
  }
  return { lo, hi }
}

function revokeResults(job: QueueJob) {
  job.results.forEach((r) => URL.revokeObjectURL(r.url))
}

const finished = (j: QueueJob) => j.status === 'done' || j.status === 'error' || j.status === 'cancelled'

export const useEditor = create<EditorState>((set, get) => ({
  file: null,
  fileSource: 'local',
  previewUrl: null,
  isProxy: false,
  proxyState: 'none',
  proxyProgress: 0,
  duration: 0,
  info: null,

  videoEl: null,
  currentTime: 0,
  playing: false,
  playUntil: null,

  segments: [],
  selectedId: null,
  markIn: null,
  notice: null,
  splitOpen: false,

  engine: 'idle',
  engineError: null,
  settings: DEFAULT_SETTINGS,
  crop: null,
  queue: [],
  queueRunning: false,

  setFile: (file, source = 'local') => {
    const { previewUrl, queue } = get()
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    queue.forEach(revokeResults)
    set({
      file,
      fileSource: file ? source : 'local',
      previewUrl: file ? URL.createObjectURL(file) : null,
      isProxy: false,
      proxyState: 'none',
      proxyProgress: 0,
      duration: 0,
      info: null,
      crop: null,
      currentTime: 0,
      playing: false,
      playUntil: null,
      segments: [],
      selectedId: null,
      markIn: null,
      notice: null,
      splitOpen: false,
      queue: [],
    })
  },
  setPreview: (url, isProxy) => {
    const { previewUrl } = get()
    if (previewUrl && previewUrl !== url) URL.revokeObjectURL(previewUrl)
    set({ previewUrl: url, isProxy })
  },
  setProxyState: (proxyState, proxyProgress = 0) => set({ proxyState, proxyProgress }),
  setDuration: (duration) => set({ duration }),
  setInfo: (info) => set({ info }),
  setVideoEl: (videoEl) => set({ videoEl }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setPlaying: (playing) => set({ playing }),

  seek: (t) => {
    const { videoEl, duration } = get()
    const clamped = Math.min(Math.max(0, t), duration || 0)
    if (videoEl) videoEl.currentTime = clamped
    set({ currentTime: clamped, playUntil: null })
  },
  togglePlay: () => {
    const { videoEl } = get()
    if (!videoEl) return
    if (videoEl.paused) {
      if (videoEl.ended) videoEl.currentTime = 0
      set({ playUntil: null })
      void videoEl.play()
    } else videoEl.pause()
  },
  playRange: (start, end) => {
    const { videoEl } = get()
    if (!videoEl) return
    videoEl.currentTime = start
    set({ currentTime: start, playUntil: end })
    void videoEl.play()
  },

  setMarkIn: () => set({ markIn: get().currentTime, notice: null }),
  markOut: () => {
    const { markIn, currentTime, segments } = get()
    if (markIn === null) {
      set({ notice: 'Primero marca el inicio (tecla I).' })
      return
    }
    const start = Math.min(markIn, currentTime)
    const end = Math.max(markIn, currentTime)
    if (end - start < MIN_SEGMENT_SECONDS) {
      set({ notice: 'El segmento es demasiado corto.' })
      return
    }
    if (overlaps(segments, start, end)) {
      set({ notice: 'Ese rango se solapa con otro segmento.' })
      return
    }
    const seg = { id: newId(), start: round3(start), end: round3(end) }
    set({ segments: [...segments, seg], selectedId: seg.id, markIn: null, notice: null })
  },
  addSegmentAtPlayhead: () => {
    const { currentTime, segments, duration } = get()
    if (!duration) return
    const gap = freeGapAt(segments, currentTime, duration)
    if (!gap || gap.hi - currentTime < MIN_SEGMENT_SECONDS) {
      set({ notice: 'No hay espacio libre en la posición actual.' })
      return
    }
    const len = Math.min(Math.max(duration * 0.1, 3), 15)
    const end = Math.min(currentTime + len, gap.hi)
    const seg = { id: newId(), start: round3(currentTime), end: round3(end) }
    set({ segments: [...segments, seg], selectedId: seg.id, notice: null })
  },
  updateSegment: (id, start, end) => {
    const { segments, duration } = get()
    start = round3(Math.max(0, start))
    end = round3(Math.min(duration, end))
    if (end - start < MIN_SEGMENT_SECONDS - 1e-6) return 'El segmento es demasiado corto.'
    if (overlaps(segments, start, end, id)) return 'Se solapa con otro segmento.'
    set({ segments: segments.map((s) => (s.id === id ? { ...s, start, end } : s)) })
    return null
  },
  removeSegment: (id) => {
    const { segments, selectedId } = get()
    set({
      segments: segments.filter((s) => s.id !== id),
      selectedId: selectedId === id ? null : selectedId,
    })
  },
  moveSegment: (id, dir) => {
    const segments = [...get().segments]
    const i = segments.findIndex((s) => s.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= segments.length) return
    ;[segments[i], segments[j]] = [segments[j], segments[i]]
    set({ segments })
  },
  selectSegment: (selectedId) => set({ selectedId }),
  replaceSegments: (ranges) => {
    const segments = ranges.map((r) => ({ id: newId(), start: round3(r.start), end: round3(r.end) }))
    set({ segments, selectedId: null, markIn: null, notice: null })
  },
  setSplitOpen: (splitOpen) => set({ splitOpen }),
  setNotice: (notice) => set({ notice }),

  setEngine: (engine, engineError = null) => set({ engine, engineError }),
  setSettings: (patch) => {
    const prev = get().settings
    const next = { ...prev, ...patch }
    // Cambiar algo que define el formato convierte el preset en "Personalizado".
    const shapeKeys: (keyof ExportSettings)[] = ['aspect', 'fit', 'resolution', 'bitrate']
    if (shapeKeys.some((k) => k in patch && patch[k] !== prev[k])) next.presetId = CUSTOM_PRESET_ID
    // Si cambia la proporción o la rotación, el encuadre anterior deja de tener sentido.
    const resetCrop = next.aspect !== prev.aspect || next.rotation !== prev.rotation
    set({ settings: next, ...(resetCrop ? { crop: null } : {}) })
  },
  choosePreset: (preset) => {
    const prev = get().settings
    const next = applyPreset(prev, preset)
    set({ settings: next, ...(next.aspect !== prev.aspect ? { crop: null } : {}) })
  },
  setCrop: (crop) => set({ crop }),
  enqueue: () => {
    const { segments, settings, crop, queue } = get()
    if (segments.length === 0) return null
    const job: QueueJob = {
      id: `job-${Date.now().toString(36)}-${idCounter++}`,
      settings: { ...settings },
      crop: crop ? { ...crop } : null,
      segments: segments.map((s) => ({ ...s })),
      status: 'pending',
      progress: 0,
      label: 'En cola',
      results: [],
      error: null,
    }
    set({ queue: [...queue, job] })
    return job.id
  },
  updateJob: (id, patch) => set({ queue: get().queue.map((j) => (j.id === id ? { ...j, ...patch } : j)) }),
  removeJob: (id) => {
    const job = get().queue.find((j) => j.id === id)
    if (!job || job.status === 'running') return
    revokeResults(job)
    set({ queue: get().queue.filter((j) => j.id !== id) })
  },
  clearFinished: () => {
    const { queue } = get()
    queue.filter(finished).forEach(revokeResults)
    set({ queue: queue.filter((j) => !finished(j)) })
  },
  setQueueRunning: (queueRunning) => set({ queueRunning }),
}))

/** Límites (por tiempo) entre los que puede moverse un segmento sin pisar a sus vecinos. */
export function neighborBounds(segments: Segment[], id: string, duration: number) {
  const seg = segments.find((s) => s.id === id)
  if (!seg) return { min: 0, max: duration }
  let min = 0
  let max = duration
  for (const s of segments) {
    if (s.id === id) continue
    if (s.end <= seg.start + 1e-6) min = Math.max(min, s.end)
    if (s.start >= seg.end - 1e-6) max = Math.min(max, s.start)
  }
  return { min, max }
}
