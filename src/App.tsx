import { useEffect } from 'react'
import { ExportPanel } from './components/ExportPanel'
import { SegmentControls, SegmentList } from './components/SegmentList'
import { SplitDialog } from './components/SplitDialog'
import { Timeline } from './components/Timeline'
import { Uploader } from './components/Uploader'
import { VideoPlayer } from './components/VideoPlayer'
import { useFfmpeg, useFfmpegStatus } from './hooks/useFfmpeg'
import { formatBytes } from './lib/formatUtils'
import { useEditor } from './store/editorStore'

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target
      if (el instanceof Element && el.closest('input, textarea, select, [contenteditable="true"]')) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const s = useEditor.getState()
      if (!s.file || !s.duration || s.splitOpen) return
      const frame = 1 / 30
      switch (e.key) {
        case ' ':
          e.preventDefault()
          s.togglePlay()
          break
        case 'i':
        case 'I':
          s.setMarkIn()
          break
        case 'o':
        case 'O':
          s.markOut()
          break
        case 'ArrowLeft':
          e.preventDefault()
          s.seek(s.currentTime - (e.shiftKey ? 1 : frame))
          break
        case 'ArrowRight':
          e.preventDefault()
          s.seek(s.currentTime + (e.shiftKey ? 1 : frame))
          break
        case 'Delete':
        case 'Backspace':
          if (s.selectedId) s.removeSegment(s.selectedId)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** Descarga el video importado de YouTube (solo vive en la memoria del navegador). */
function SaveOriginalButton({ file }: { file: File }) {
  const save = () => {
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
  return (
    <button type="button" className="btn-secondary" onClick={save} title="Descarga el video completo de YouTube a tu carpeta de Descargas">
      Guardar original
    </button>
  )
}

function EngineBadge() {
  const engine = useEditor((s) => s.engine)
  const error = useEditor((s) => s.engineError)
  const map = {
    idle: ['bg-zinc-600', 'Motor sin cargar'],
    loading: ['bg-amber-400 animate-pulse', 'Cargando motor…'],
    ready: ['bg-emerald-400', 'Motor listo'],
    error: ['bg-red-500', 'Error del motor'],
  } as const
  const [dot, text] = map[engine]
  return (
    <span className="flex items-center gap-2 text-xs text-zinc-400" title={error ?? 'ffmpeg.wasm'}>
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {text}
    </span>
  )
}

export default function App() {
  useFfmpegStatus()
  useShortcuts()
  const file = useEditor((s) => s.file)
  const fileSource = useEditor((s) => s.fileSource)
  const info = useEditor((s) => s.info)
  const { preload } = useFfmpeg()

  // Carga perezosa: el motor (~30 MB) solo se descarga cuando hay un video.
  useEffect(() => {
    if (file) preload()
  }, [file, preload])

  // Al cargar un video (en cuanto se conoce su duración) se ofrece dividirlo en clips.
  const ready = useEditor((s) => s.duration > 0)
  const setSplitOpen = useEditor((s) => s.setSplitOpen)
  useEffect(() => {
    if (file && ready && useEditor.getState().segments.length === 0) setSplitOpen(true)
  }, [file, ready, setSplitOpen])

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-4 border-b border-zinc-800 px-4 py-3 sm:px-6">
        <h1 className="text-lg font-semibold tracking-tight">
          <span className="text-violet-400">✂</span> Editor de clips
        </h1>
        {file && (
          <span className="hidden min-w-0 truncate text-sm text-zinc-400 sm:inline" title={file.name}>
            {file.name} · {formatBytes(file.size)}
            {info?.videoCodec && ` · ${info.videoCodec.toUpperCase()}`}
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          <EngineBadge />
          {file && fileSource === 'youtube' && <SaveOriginalButton file={file} />}
          {file && <Uploader compact />}
        </div>
      </header>

      {!file ? (
        <main className="flex flex-1 items-center justify-center p-4 sm:p-8">
          <Uploader />
        </main>
      ) : (
        <main className="grid flex-1 gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex min-w-0 flex-col gap-4">
            <VideoPlayer />
            <Timeline />
            <SegmentControls />
            <p className="text-xs text-zinc-500">
              Atajos: <kbd>Espacio</kbd> reproducir · <kbd>I</kbd>/<kbd>O</kbd> marcar inicio/fin · <kbd>←</kbd>/<kbd>→</kbd> fotograma
              (<kbd>Shift</kbd> = 1 s) · <kbd>Supr</kbd> borrar segmento seleccionado
            </p>
          </div>
          <aside className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-zinc-300">Segmentos</h2>
              <SegmentList />
            </div>
            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-zinc-300">Exportar</h2>
              <ExportPanel />
            </div>
          </aside>
        </main>
      )}
      <SplitDialog />
    </div>
  )
}
