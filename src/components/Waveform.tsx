import { useEffect, useRef } from 'react'
import { useWaveform } from '../hooks/useWaveform'

/**
 * Forma de onda del audio, dibujada en un canvas que ocupa toda la pista de la línea de tiempo.
 * Cada columna de píxeles muestra el pico de los buckets que le corresponden.
 */
export function Waveform() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wave = useWaveform()
  const peaks = wave.status === 'loading' || wave.status === 'done' ? wave.peaks : null
  const version = wave.status === 'loading' || wave.status === 'done' ? wave.version : 0

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const draw = () => {
      const { clientWidth: w, clientHeight: h } = canvas
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.max(1, Math.round(w * dpr))
      canvas.height = Math.max(1, Math.round(h * dpr))
      const ctx = canvas.getContext('2d')!
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      if (!peaks) return
      let globalMax = 0.05
      for (const p of peaks) if (p > globalMax) globalMax = p
      const mid = h / 2
      const n = peaks.length
      ctx.fillStyle = 'rgba(161, 161, 170, 0.45)' // zinc-400
      for (let x = 0; x < w; x++) {
        const a = Math.floor((x / w) * n)
        const b = Math.max(a + 1, Math.floor(((x + 1) / w) * n))
        let max = 0
        for (let i = a; i < b && i < n; i++) if (peaks[i] > max) max = peaks[i]
        // Escala raíz: los pasajes suaves siguen siendo visibles.
        const amp = Math.sqrt(max / globalMax) * (mid - 2)
        if (amp > 0.3) ctx.fillRect(x, mid - amp, 1, amp * 2)
      }
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [peaks, version])

  return (
    <>
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
      {wave.status === 'loading' && (
        <span className="pointer-events-none absolute right-1 bottom-0.5 text-[10px] text-zinc-500">
          Analizando audio… {Math.round(wave.progress * 100)}%
        </span>
      )}
      {wave.status === 'no-audio' && (
        <span className="pointer-events-none absolute right-1 bottom-0.5 text-[10px] text-zinc-600">Sin audio</span>
      )}
    </>
  )
}
