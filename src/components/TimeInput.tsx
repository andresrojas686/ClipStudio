import { useRef, useState } from 'react'
import { formatTime } from '../lib/formatUtils'

/** Campo de tiempo (mm:ss.cc): edita un borrador y confirma con Enter o al salir; Escape cancela. */
export function TimeInput({
  label,
  value,
  onCommit,
  onFocus,
}: {
  label: string
  value: number
  onCommit: (text: string) => boolean
  onFocus: () => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const cancelled = useRef(false)
  const shown = draft ?? formatTime(value, 2)
  return (
    <input
      aria-label={label}
      className="w-24 rounded bg-zinc-800 px-2 py-1 font-mono text-sm tabular-nums outline-none focus:ring-2 focus:ring-violet-500"
      value={shown}
      onFocus={(e) => {
        onFocus()
        setDraft(formatTime(value, 2))
        e.target.select()
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null && !cancelled.current) onCommit(draft)
        cancelled.current = false
        setDraft(null)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          cancelled.current = true
          ;(e.target as HTMLInputElement).blur()
        }
      }}
    />
  )
}
