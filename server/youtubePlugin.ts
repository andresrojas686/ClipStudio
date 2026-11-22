/**
 * Mini-backend local para importar videos de YouTube (Fase 2.6).
 * Se monta como middleware en `vite dev` y `vite preview`; no existe en un build estático.
 *
 *  GET /api/yt/health                  → { ok, ytdlp, ffmpeg, version }
 *  GET /api/yt/info?url=               → { title, duration, thumbnail, heights[] }
 *  GET /api/yt/thumb?url=              → miniatura (proxy: COEP bloquea imágenes de otro origen)
 *  GET /api/yt/download?url=&height=   → SSE: progress / done {id, name, size} / fail {message}
 *  GET /api/yt/file/:id                → el MP4 (se borra tras enviarlo)
 */
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import https from 'node:https'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import tls from 'node:tls'
import type { Connect, Plugin } from 'vite'

const HEIGHTS = [360, 480, 720, 1080] as const
const YT_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtu.be']
const THUMB_HOSTS = /^i\d?\.ytimg\.com$/

interface Tools {
  ytdlp: string | null
  ffmpeg: string | null
  version: string | null
}

interface Download {
  file: string
  name: string
}

/** Ejecuta `cmd --version` sin bloquear el servidor; null si no existe o falla. */
const versionOf = (cmd: string, flag: string) =>
  new Promise<string | null>((done) =>
    execFile(cmd, [flag], { windowsHide: true, timeout: 20_000 }, (err, stdout) => done(err ? null : String(stdout).trim())),
  )

async function findTools(root: string): Promise<Tools> {
  const isWin = process.platform === 'win32'
  const local = resolve(root, 'bin', isWin ? 'yt-dlp.exe' : 'yt-dlp')
  let ytdlp: string | null = existsSync(local) ? local : null
  let version: string | null = null
  const candidate = ytdlp ?? 'yt-dlp'
  version = await versionOf(candidate, '--version')
  ytdlp = version ? candidate : null
  let ffmpeg: string | null = null
  try {
    const p = createRequire(resolve(root, 'package.json'))('ffmpeg-static') as string | null
    if (p && existsSync(p)) ffmpeg = p
  } catch {
    /* sin ffmpeg-static: se intenta con el del PATH */
  }
  if (!ffmpeg && (await versionOf('ffmpeg', '-version'))) ffmpeg = 'ffmpeg'
  return { ytdlp, ffmpeg, version }
}

export function isYoutubeUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return (u.protocol === 'https:' || u.protocol === 'http:') && YT_HOSTS.includes(u.hostname.toLowerCase())
  } catch {
    return false
  }
}

/** Traduce los errores típicos de yt-dlp a mensajes en español. */
function explain(stderr: string): string {
  const s = stderr.toLowerCase()
  if (s.includes('private video')) return 'El video es privado. Inicia sesión o pide acceso al dueño.'
  if (s.includes('unavailable') || s.includes('not available') || s.includes('does not exist')) return 'El video no está disponible (borrado, bloqueado en tu país o link incorrecto).'
  if (s.includes('sign in to confirm your age') || s.includes('age-restricted')) return 'El video tiene restricción de edad y no se puede descargar sin sesión.'
  if (s.includes('sign in to confirm') && s.includes('bot')) return 'YouTube pidió verificar que no eres un bot. Espera unos minutos y vuelve a intentarlo.'
  if (s.includes('is not a valid url') || s.includes('unsupported url')) return 'El link no es un video de YouTube válido.'
  if (s.includes('live event') || s.includes('is live')) return 'No se pueden importar transmisiones en directo.'
  if (s.includes('certificate')) return 'Error de certificado HTTPS (¿antivirus o proxy inspeccionando el tráfico?).'
  if (s.includes('unable to extract') || s.includes('signature') || s.includes('nsig') || s.includes('http error 403'))
    return 'yt-dlp no pudo leer el video; probablemente está desactualizado. Ejecuta `npm run update-ytdlp` y reinicia el servidor.'
  const last = stderr
    .split(/\r?\n/)
    .filter((l) => l.startsWith('ERROR'))
    .pop()
  return last ? last.replace(/^ERROR:\s*/, '') : 'yt-dlp terminó con un error inesperado.'
}

/**
 * GET HTTPS confiando también en los certificados del sistema operativo
 * (antivirus o proxies que inspeccionan HTTPS instalan ahí su raíz).
 */
function getWithSystemCa(url: URL): Promise<{ type: string; body: Buffer }> {
  const getCa = (tls as { getCACertificates?: (kind: string) => string[] }).getCACertificates
  let ca: string[] | undefined
  try {
    ca = getCa ? [...getCa('default'), ...getCa('system')] : undefined
  } catch {
    ca = undefined
  }
  return new Promise((done, fail) => {
    const req = https.get(url, { ca, timeout: 10_000 }, (r) => {
      if (r.statusCode !== 200) {
        r.resume()
        return fail(new Error(`HTTP ${r.statusCode}`))
      }
      const chunks: Buffer[] = []
      r.on('data', (c: Buffer) => chunks.push(c))
      r.on('end', () => done({ type: r.headers['content-type'] ?? 'image/jpeg', body: Buffer.concat(chunks) }))
      r.on('error', fail)
    })
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', fail)
  })
}

/** Mata yt-dlp y sus hijos (en Windows el .exe lanza un proceso hijo que seguiría escribiendo). */
function killTree(p: ChildProcess) {
  if (p.exitCode !== null || !p.pid) return
  if (process.platform === 'win32') execFile('taskkill', ['/pid', String(p.pid), '/T', '/F'], { windowsHide: true }, () => {})
  else p.kill()
}

/** Borrado asíncrono tolerante a bloqueos temporales de archivos (Windows); nunca tumba el servidor. */
const removeDir = (dir: string) =>
  rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 500 }).catch((err) =>
    console.warn('[youtube] no se pudo borrar', dir, err instanceof Error ? err.message : err),
  )

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function query(req: IncomingMessage) {
  return new URL(req.url ?? '/', 'http://localhost').searchParams
}

export function youtubePlugin(): Plugin {
  let root = process.cwd()
  let tools: Promise<Tools> | null = null
  const workDir = join(tmpdir(), 'clipstudio-yt')
  const ready = new Map<string, Download>()
  let active: ChildProcess | null = null

  const getTools = () => (tools ??= findTools(root))

  /** Argumentos comunes: certificados del sistema (antivirus/proxy) y Node como runtime de JS. */
  const baseArgs = () => ['--compat-options', 'no-certifi', '--js-runtimes', `node:${process.execPath}`, '--no-playlist', '--no-warnings']

  const run = (ytdlp: string, args: string[]) =>
    new Promise<{ code: number; stdout: string; stderr: string }>((done) => {
      const p = spawn(ytdlp, [...baseArgs(), ...args], { windowsHide: true })
      let stdout = ''
      let stderr = ''
      p.stdout.on('data', (d) => (stdout += d))
      p.stderr.on('data', (d) => (stderr += d))
      p.on('error', (e) => done({ code: -1, stdout, stderr: String(e) }))
      p.on('close', (code) => done({ code: code ?? -1, stdout, stderr }))
    })

  const health: Connect.SimpleHandleFunction = async (_req, res) => {
    tools = null // re-detecta (p. ej. tras `npm run update-ytdlp`)
    const t = await getTools()
    json(res, 200, { ok: !!(t.ytdlp && t.ffmpeg), ytdlp: !!t.ytdlp, ffmpeg: !!t.ffmpeg, version: t.version })
  }

  const info: Connect.SimpleHandleFunction = async (req, res) => {
    const url = query(req).get('url') ?? ''
    if (!isYoutubeUrl(url)) return json(res, 400, { message: 'El link no es de YouTube.' })
    const { ytdlp } = await getTools()
    if (!ytdlp) return json(res, 503, { message: 'yt-dlp no está instalado. Ejecuta `npm run update-ytdlp`.' })
    const r = await run(ytdlp, ['-J', url])
    if (r.code !== 0) return json(res, 422, { message: explain(r.stderr) })
    try {
      const j = JSON.parse(r.stdout)
      if (j.is_live) return json(res, 422, { message: 'No se pueden importar transmisiones en directo.' })
      const maxH = Math.max(0, ...((j.formats ?? []) as { height?: number; vcodec?: string }[]).filter((f) => f.vcodec && f.vcodec !== 'none').map((f) => f.height ?? 0))
      const heights = HEIGHTS.filter((h) => h <= Math.max(maxH, HEIGHTS[0]))
      json(res, 200, { id: j.id, title: j.title ?? 'video', duration: j.duration ?? 0, thumbnail: j.thumbnail ?? null, channel: j.channel ?? j.uploader ?? null, heights })
    } catch {
      json(res, 500, { message: 'Respuesta de yt-dlp no válida.' })
    }
  }

  const thumb: Connect.SimpleHandleFunction = async (req, res) => {
    const raw = query(req).get('url') ?? ''
    try {
      const u = new URL(raw)
      if (u.protocol !== 'https:' || !THUMB_HOSTS.test(u.hostname)) throw new Error('host')
      const r = await getWithSystemCa(u)
      res.setHeader('Content-Type', r.type)
      res.setHeader('Cache-Control', 'max-age=3600')
      res.end(r.body)
    } catch (err) {
      console.warn('[youtube] miniatura no disponible:', err instanceof Error ? (err.cause ?? err.message) : err)
      res.statusCode = 404
      res.end()
    }
  }

  const download: Connect.SimpleHandleFunction = async (req, res) => {
    const q = query(req)
    const url = q.get('url') ?? ''
    const height = Number(q.get('height')) || 1080
    if (!isYoutubeUrl(url)) return json(res, 400, { message: 'El link no es de YouTube.' })
    const t = await getTools()
    if (!t.ytdlp || !t.ffmpeg) return json(res, 503, { message: 'Falta yt-dlp o ffmpeg. Ejecuta `npm install` o `npm run update-ytdlp`.' })
    if (active) return json(res, 409, { message: 'Ya hay una descarga en curso.' })

    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

    const id = randomUUID()
    const dir = join(workDir, id)
    mkdirSync(dir, { recursive: true })
    const h = Math.min(Math.max(144, height), 2160)
    const args = [
      ...baseArgs(),
      '--newline',
      '--progress',
      '--no-part',
      '--ffmpeg-location',
      t.ffmpeg,
      // H.264 + AAC en MP4: sigue el camino rápido de ffmpeg.wasm (no AV1/VP9).
      '-f',
      `bv*[vcodec^=avc1][height<=${h}]+ba[ext=m4a]/b[vcodec^=avc1][height<=${h}]/bv*[height<=${h}]+ba/b`,
      '--merge-output-format',
      'mp4',
      '--progress-template',
      'download:@@P %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s %(info.vcodec)s',
      '--print',
      'before_dl:@@T %(title)s',
      '--print',
      'after_move:@@F %(filepath)s',
      '-o',
      join(dir, 'video.%(ext)s'),
      url,
    ]
    const p = spawn(t.ytdlp, args, { windowsHide: true })
    active = p
    let title = 'video'
    let finalPath = ''
    let stderr = ''
    let buf = ''
    let finished = false

    const cleanupDir = () => removeDir(dir)

    p.stdout.on('data', (d: Buffer) => {
      buf += d.toString('utf8')
      const lines = buf.split(/\r?\n/)
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (line.startsWith('@@T ')) title = line.slice(4).trim() || title
        else if (line.startsWith('@@F ')) finalPath = line.slice(4).trim()
        else if (line.startsWith('@@P ')) {
          const [done, total, estimate, vcodec] = line.slice(4).split(' ')
          const t2 = Number(total) || Number(estimate) || 0
          const n = Number(done) || 0
          const kind = vcodec && vcodec !== 'none' && vcodec !== 'NA' ? 'video' : 'audio'
          send('progress', { phase: kind, ratio: t2 ? Math.min(1, n / t2) : 0, bytes: n, total: t2 })
          // Video y audio separados: al terminar el audio, yt-dlp los une con ffmpeg.
          if (kind === 'audio' && t2 && n >= t2) send('progress', { phase: 'merge', ratio: 1, bytes: n, total: t2 })
        }
      }
    })
    p.stderr.on('data', (d) => (stderr += d))
    p.on('error', (e) => (stderr += String(e)))
    p.on('close', (code) => {
      active = null
      finished = true
      if (code === 0 && finalPath && existsSync(finalPath)) {
        ready.set(id, { file: finalPath, name: title })
        send('done', { id, name: title, size: statSync(finalPath).size })
      } else {
        cleanupDir()
        send('fail', { message: code === null ? 'Descarga cancelada.' : explain(stderr) })
      }
      res.end()
    })
    // Si el navegador cierra la conexión (Cancelar), se mata yt-dlp y se limpia.
    res.on('close', () => {
      if (!finished) {
        killTree(p) // el 'close' del proceso limpia la carpeta
      }
    })
  }

  const file: Connect.SimpleHandleFunction = (req, res) => {
    const id = (req.url ?? '').replace(/^\//, '').split('?')[0]
    const item = ready.get(id)
    if (!item || !existsSync(item.file)) return json(res, 404, { message: 'Archivo no encontrado.' })
    ready.delete(id)
    res.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Content-Length': statSync(item.file).size,
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Cache-Control': 'no-store',
    })
    const stream = createReadStream(item.file)
    stream.pipe(res)
    const cleanup = () => setTimeout(() => removeDir(join(workDir, id)), 500)
    res.on('close', cleanup)
  }

  const mount = (middlewares: Connect.Server) => {
    // Restos de sesiones anteriores.
    try {
      for (const d of readdirSync(workDir)) removeDir(join(workDir, d))
    } catch {
      /* no existe todavía */
    }
    middlewares.use('/api/yt/health', health)
    middlewares.use('/api/yt/info', info)
    middlewares.use('/api/yt/thumb', thumb)
    middlewares.use('/api/yt/download', download)
    middlewares.use('/api/yt/file', file)
  }

  return {
    name: 'clipstudio-youtube',
    configResolved(config) {
      root = config.root
    },
    configureServer(server) {
      mount(server.middlewares)
      server.httpServer?.on('close', () => active && killTree(active))
    },
    configurePreviewServer(server) {
      mount(server.middlewares)
    },
  }
}
