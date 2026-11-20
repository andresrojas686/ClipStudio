import { useRef, useState, type DragEvent } from 'react'
import { ACCEPTED_EXTENSIONS, checkFile, formatBytes } from '../lib/formatUtils'
import { useEditor } from '../store/editorStore'

const ACCEPT = ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(',')

export function Uploader({ compact = false }: { compact?: boolean }) {
  const setFile = useEditor((s) => s.setFile)
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<{ file: File; warning: string } | null>(null)

  const handle = (file: File | undefined) => {
    if (!file) return
    setError(null)
    setPending(null)
    const check = checkFile(file)
    if (!check.ok) setError(check.error)
    else if (check.warning) setPending({ file, warning: check.warning })
    else setFile(file)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    handle(e.dataTransfer.files[0])
  }

  const picker = (
    <input
      ref={inputRef}
      type="file"
      accept={ACCEPT}
      className="hidden"
      onChange={(e) => {
        handle(e.target.files?.[0])
        e.target.value = ''
      }}
    />
  )

  if (compact) {
    return (
      <>
        {picker}
        <button type="button" className="btn-secondary" onClick={() => inputRef.current?.click()}>
          Cambiar video
        </button>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {pending && <SizeWarning pending={pending} onCancel={() => setPending(null)} onAccept={() => setFile(pending.file)} />}
      </>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      {picker}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-16 text-center transition ${
          dragging ? 'border-violet-400 bg-violet-500/10' : 'border-zinc-700 bg-zinc-900 hover:border-zinc-500'
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-12 w-12 text-violet-400" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M12 4v12m0-12-4 4m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="text-lg font-medium">Arrastra un video aquí o haz clic para elegirlo</p>
        <p className="text-sm text-zinc-400">
          {ACCEPTED_EXTENSIONS.map((e) => e.toUpperCase()).join(' · ')} — recomendado hasta 500 MB
        </p>
        <p className="text-xs text-zinc-500">El video se procesa en tu navegador; nunca se sube a ningún servidor.</p>
      </div>
      {error && <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
      {pending && <SizeWarning pending={pending} onCancel={() => setPending(null)} onAccept={() => setFile(pending.file)} />}
    </div>
  )
}

function SizeWarning({
  pending,
  onCancel,
  onAccept,
}: {
  pending: { file: File; warning: string }
  onCancel: () => void
  onAccept: () => void
}) {
  return (
    <div className="rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
      <p className="mb-2">
        <strong>{pending.file.name}</strong> ({formatBytes(pending.file.size)}). {pending.warning}
      </p>
      <div className="flex gap-2">
        <button type="button" className="btn-primary" onClick={onAccept}>
          Continuar igualmente
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  )
}
