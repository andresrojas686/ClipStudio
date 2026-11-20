import { create } from 'zustand'
import { MIN_SEGMENT_SECONDS } from '../lib/formatUtils'

export interface Segment {
  id: string
  start: number
  end: number
}

export type OutputFormat = 'original' | 'vertical'
export type VerticalMode = 'crop' | 'blur'
export type CutMode = 'fast' | 'precise'
export type CombineMode = 'separate' | 'merge'

export interface ExportOptions {
  format: OutputFormat
  verticalMode: VerticalMode
  cutMode: CutMode
  combine: CombineMode
}

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface ExportResult {
  name: string
  url: string
  size: number
}

export type JobState =
  | { kind: 'idle' }
  | { kind: 'running'; label: string; progress: number }
  | { kind: 'done'; results: ExportResult[] }
  | { kind: 'error'; message: string }
  | { kind: 'cancelled' }

interface EditorState {
  // Video fuente
  file: File | null
  previewUrl: string | null
  isProxy: boolean
  proxyState: 'none' | 'building' | 'failed'
  proxyProgress: number
  duration: number
  hasAudio: boolean | null

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

  // Motor y exportación
  engine: EngineStatus
  engineError: string | null
  options: ExportOptions
  job: JobState

  setFile: (file: File | null) => void
  setPreview: (url: string, isProxy: boolean) => void
  setProxyState: (s: EditorState['proxyState'], progress?: number) => void
  setDuration: (d: number) => void
  setHasAudio: (v: boolean) => void
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

  setEngine: (s: EngineStatus, error?: string | null) => void
  setOptions: (patch: Partial<ExportOptions>) => void
  setJob: (job: JobState) => void
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

function revokeResults(job: JobState) {
  if (job.kind === 'done') job.results.forEach((r) => URL.revokeObjectURL(r.url))
}

export const useEditor = create<EditorState>((set, get) => ({
  file: null,
  previewUrl: null,
  isProxy: false,
  proxyState: 'none',
  proxyProgress: 0,
  duration: 0,
  hasAudio: null,

  videoEl: null,
  currentTime: 0,
  playing: false,
  playUntil: null,

  segments: [],
  selectedId: null,
  markIn: null,
  notice: null,

  engine: 'idle',
  engineError: null,
  options: { format: 'vertical', verticalMode: 'crop', cutMode: 'precise', combine: 'separate' },
  job: { kind: 'idle' },

  setFile: (file) => {
    const { previewUrl, job } = get()
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    revokeResults(job)
    set({
      file,
      previewUrl: file ? URL.createObjectURL(file) : null,
      isProxy: false,
      proxyState: 'none',
      proxyProgress: 0,
      duration: 0,
      hasAudio: null,
      currentTime: 0,
      playing: false,
      playUntil: null,
      segments: [],
      selectedId: null,
      markIn: null,
      notice: null,
      job: { kind: 'idle' },
    })
  },
  setPreview: (url, isProxy) => {
    const { previewUrl } = get()
    if (previewUrl && previewUrl !== url) URL.revokeObjectURL(previewUrl)
    set({ previewUrl: url, isProxy })
  },
  setProxyState: (proxyState, proxyProgress = 0) => set({ proxyState, proxyProgress }),
  setDuration: (duration) => set({ duration }),
  setHasAudio: (hasAudio) => set({ hasAudio }),
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
  setNotice: (notice) => set({ notice }),

  setEngine: (engine, engineError = null) => set({ engine, engineError }),
  setOptions: (patch) => set({ options: { ...get().options, ...patch } }),
  setJob: (job) => {
    const prev = get().job
    if (prev !== job) revokeResults(prev)
    set({ job })
  },
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
