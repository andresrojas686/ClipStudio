/** Cliente de la API local /api/yt (plugin de Vite con yt-dlp, Fase 2.6). */

export interface YtHealth {
  ok: boolean
  ytdlp: boolean
  ffmpeg: boolean
  version: string | null
}

export interface YtInfo {
  id: string
  title: string
  duration: number
  thumbnail: string | null
  channel: string | null
  heights: number[]
}

export type YtPhase = 'video' | 'audio' | 'merge' | 'transfer'

export interface YtProgress {
  phase: YtPhase
  ratio: number
}

const YT_RE = /^(https?:\/\/)?((www|m|music)\.)?(youtube\.com|youtu\.be)\//i

export const looksLikeYoutube = (s: string) => YT_RE.test(s.trim())

const normalize = (s: string) => (/^https?:\/\//i.test(s.trim()) ? s.trim() : `https://${s.trim()}`)

/** null si la API no existe (build estático) → la sección de YouTube se oculta. */
export async function checkHealth(): Promise<YtHealth | null> {
  try {
    const r = await fetch('/api/yt/health')
    if (!r.ok || !r.headers.get('content-type')?.includes('json')) return null
    return (await r.json()) as YtHealth
  } catch {
    return null
  }
}

async function errorOf(r: Response) {
  try {
    return ((await r.json()) as { message?: string }).message ?? `Error ${r.status}`
  } catch {
    return `Error ${r.status}`
  }
}

export async function getInfo(url: string, signal?: AbortSignal): Promise<YtInfo> {
  const r = await fetch(`/api/yt/info?url=${encodeURIComponent(normalize(url))}`, { signal })
  if (!r.ok) throw new Error(await errorOf(r))
  return (await r.json()) as YtInfo
}

export const thumbUrl = (src: string) => `/api/yt/thumb?url=${encodeURIComponent(src)}`

const safeName = (title: string) =>
  `${title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'youtube'}.mp4`

/** Descarga el video (yt-dlp en el servidor local) y lo devuelve como File. */
export function download(url: string, height: number, onProgress: (p: YtProgress) => void) {
  const abort = new AbortController()
  let es: EventSource | null = null

  const promise = new Promise<File>((resolve, reject) => {
    es = new EventSource(`/api/yt/download?url=${encodeURIComponent(normalize(url))}&height=${height}`)
    let settled = false
    const fail = (msg: string) => {
      if (settled) return
      settled = true
      es?.close()
      reject(new Error(msg))
    }
    es.addEventListener('progress', (e) => onProgress(JSON.parse((e as MessageEvent).data) as YtProgress))
    es.addEventListener('fail', (e) => fail((JSON.parse((e as MessageEvent).data) as { message: string }).message))
    es.addEventListener('done', async (e) => {
      settled = true
      es?.close()
      const { id, name, size } = JSON.parse((e as MessageEvent).data) as { id: string; name: string; size: number }
      try {
        const r = await fetch(`/api/yt/file/${id}`, { signal: abort.signal })
        if (!r.ok || !r.body) throw new Error(await errorOf(r))
        // Lectura en trozos para mostrar el progreso de la transferencia al navegador.
        const reader = r.body.getReader()
        const chunks: Uint8Array<ArrayBuffer>[] = []
        let got = 0
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(value)
          got += value.byteLength
          onProgress({ phase: 'transfer', ratio: size ? got / size : 0 })
        }
        resolve(new File(chunks, safeName(name), { type: 'video/mp4' }))
      } catch (err) {
        reject(abort.signal.aborted ? new Error('Descarga cancelada.') : err)
      }
    })
    // Error de red o respuesta JSON (409/400) en vez de SSE. Se cierra para que
    // EventSource no reconecte solo (eso lanzaría otra descarga).
    es.onerror = () => fail('Se perdió la conexión con el servidor local (¿hay otra descarga en curso?).')
    abort.signal.addEventListener('abort', () => fail('Descarga cancelada.'))
  })

  return {
    promise,
    cancel: () => {
      es?.close() // el servidor detecta el cierre y mata yt-dlp
      abort.abort()
    },
  }
}
