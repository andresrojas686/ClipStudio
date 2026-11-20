export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.round(Math.min(Math.max(value, 0), 1) * 100)
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <div className="flex justify-between text-xs text-zinc-400">
          <span>{label}</span>
          <span className="tabular-nums">{pct}%</span>
        </div>
      )}
      <div
        className="h-2 overflow-hidden rounded-full bg-zinc-800"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className="h-full rounded-full bg-violet-500 transition-[width] duration-200" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
