import { FFFSType, FFmpeg, type LogEvent } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'
import { getExtension } from './formatUtils'

/**
 * Envoltorio único sobre ffmpeg.wasm.
 * - Carga perezosa del núcleo (single-thread) servido desde /ffmpeg.
 * - El video original se monta con WORKERFS: FFmpeg lo lee directamente del File, sin copiarlo a memoria.
 * - Las ejecuciones se serializan (FFmpeg solo procesa un comando a la vez).
 */

export class CancelledError extends Error {
  constructor() {
    super('Operación cancelada')
    this.name = 'CancelledError'
  }
}

const INPUT_DIR = '/input'

let instance: FFmpeg | null = null
let loading: Promise<FFmpeg> | null = null
let mountedFile: File | null = null
let generation = 0 // se incrementa en cada terminate() para invalidar trabajos en curso
let queue: Promise<unknown> = Promise.resolve()

type LoadListener = (s: 'loading' | 'ready' | 'error', err?: string) => void
const loadListeners = new Set<LoadListener>()
export function onLoadState(fn: LoadListener) {
  loadListeners.add(fn)
  return () => {
    loadListeners.delete(fn)
  }
}
const emitLoad: LoadListener = (s, err) => loadListeners.forEach((fn) => fn(s, err))

export function getFFmpeg(): Promise<FFmpeg> {
  if (instance) return Promise.resolve(instance)
  if (loading) return loading
  const myGen = generation
  emitLoad('loading')
  const p = (async () => {
    const ff = new FFmpeg()
    const base = `${import.meta.env.BASE_URL}ffmpeg`
    await ff.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
    })
    if (myGen !== generation) {
      ff.terminate()
      throw new CancelledError()
    }
    instance = ff
    emitLoad('ready')
    return ff
  })()
  loading = p
  p.catch((e: unknown) => {
    if (!(e instanceof CancelledError)) emitLoad('error', e instanceof Error ? e.message : String(e))
  }).finally(() => {
    if (loading === p) loading = null
  })
  return p
}

/** Procesos externos a FFmpeg (p. ej. conversiones WebCodecs) que deben pararse al cancelar. */
const terminateHooks = new Set<() => void>()
export function onTerminate(fn: () => void) {
  terminateHooks.add(fn)
  return () => {
    terminateHooks.delete(fn)
  }
}

/** Detiene cualquier proceso en curso. El siguiente uso recarga el motor. */
export function terminate() {
  generation++
  terminateHooks.forEach((fn) => fn())
  terminateHooks.clear()
  if (instance) instance.terminate()
  instance = null
  loading = null
  mountedFile = null
  queue = Promise.resolve()
  emitLoad('loading')
  // Recarga en segundo plano para que el usuario no espere en la próxima acción.
  void getFFmpeg().catch(() => {})
}

/** Ruta del archivo original dentro del FS virtual (montándolo si hace falta). */
async function ensureInput(ff: FFmpeg, file: File): Promise<string> {
  // Nombre neutro para evitar caracteres problemáticos en la ruta.
  const name = `source.${getExtension(file.name) || 'bin'}`
  if (mountedFile !== file) {
    if (mountedFile) await ff.unmount(INPUT_DIR).catch(() => {})
    await ff.createDir(INPUT_DIR).catch(() => {})
    const renamed = new File([file], name, { type: file.type })
    await ff.mount(FFFSType.WORKERFS, { files: [renamed] }, INPUT_DIR)
    mountedFile = file
  }
  return `${INPUT_DIR}/${name}`
}

export interface RunContext {
  ff: FFmpeg
  input: string
  /** Ejecuta un comando; `onTime` recibe los segundos procesados (de los logs `time=`). */
  exec: (args: string[], onTime?: (seconds: number) => void) => Promise<string[]>
  read: (path: string) => Promise<Uint8Array>
  write: (path: string, data: string | Uint8Array) => Promise<void>
  remove: (path: string) => Promise<void>
}

const TIME_RE = /time=\s*(-?\d+):(\d+):(\d+(?:\.\d+)?)/

/**
 * Ejecuta `job` con acceso exclusivo a FFmpeg y el archivo de entrada montado.
 * Si se llama a terminate() mientras corre, lanza CancelledError.
 */
export function withFFmpeg<T>(file: File, job: (ctx: RunContext) => Promise<T>): Promise<T> {
  const run = async () => {
    const myGen = generation
    const check = () => {
      if (myGen !== generation) throw new CancelledError()
    }
    const ff = await getFFmpeg()
    check()
    const input = await ensureInput(ff, file)
    check()
    const ctx: RunContext = {
      ff,
      input,
      exec: async (args, onTime) => {
        const lines: string[] = []
        const onLog = ({ message }: LogEvent) => {
          lines.push(message)
          if (onTime) {
            const m = TIME_RE.exec(message)
            if (m) onTime(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]))
          }
        }
        ff.on('log', onLog)
        try {
          const code = await ff.exec(['-hide_banner', '-nostdin', '-y', ...args])
          check()
          if (code !== 0) {
            const tail = lines.slice(-6).join('\n')
            throw new Error(`FFmpeg terminó con código ${code}.\n${tail}`)
          }
          return lines
        } catch (e) {
          check()
          throw e
        } finally {
          ff.off('log', onLog)
        }
      },
      read: async (path) => {
        const data = await ff.readFile(path)
        check()
        if (typeof data === 'string') return new TextEncoder().encode(data)
        return data
      },
      write: async (path, data) => {
        await ff.writeFile(path, data)
        check()
      },
      remove: async (path) => {
        await ff.deleteFile(path).catch(() => {})
      },
    }
    try {
      return await job(ctx)
    } catch (e) {
      // Un fallo de FFmpeg suele terminar en abort() del módulo wasm y lo deja inutilizable:
      // se recarga el motor para que el siguiente intento funcione.
      if (!(e instanceof CancelledError) && myGen === generation) terminate()
      throw e
    }
  }
  const result = queue.then(run, run)
  queue = result.catch(() => {})
  return result
}

/**
 * Códecs de video que este núcleo de ffmpeg.wasm no puede decodificar por software.
 * AV1: el decodificador nativo `av1` solo funciona con aceleración por hardware y el núcleo no trae libdav1d.
 * Con ellos solo es posible el corte sin re-codificar (copia de streams).
 */
export const UNDECODABLE_CODECS = ['av1']

export interface ProbeInfo {
  hasAudio: boolean
  duration: number | null
  /** Índice absoluto del primer stream de video real (ignora portadas incrustadas). */
  videoStream: number | null
  videoCodec: string | null
  /** Dimensiones de visualización (con la rotación de metadatos ya aplicada). */
  width: number | null
  height: number | null
}

/** Lee metadatos básicos del archivo a partir de la salida de `ffmpeg -i`. */
export async function probe(file: File): Promise<ProbeInfo> {
  return withFFmpeg(file, async ({ ff, input }) => {
    const lines: string[] = []
    const onLog = ({ message }: LogEvent) => lines.push(message)
    ff.on('log', onLog)
    try {
      // Sin salida FFmpeg devuelve error, pero ya habrá impreso la información de streams.
      await ff.exec(['-hide_banner', '-i', input])
    } finally {
      ff.off('log', onLog)
    }
    const dm = lines.map((l) => /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(l)).find(Boolean)
    // "Stream #0:1[0x2](und): Video: av1 (Main) ..." — se descartan las "(attached pic)".
    const videoLine = lines.find((l) => /Stream #0:\d+\S*: Video: /.test(l) && !/attached pic/.test(l))
    const video = videoLine ? /Stream #0:(\d+)\S*: Video: (\w+)/.exec(videoLine) : null
    const dims = videoLine ? /, (\d{2,5})x(\d{2,5})[\s,[]/.exec(videoLine) : null
    // Videos de móvil: "displaymatrix: rotation of -90.00 degrees" → FFmpeg los rota al decodificar.
    const rot = lines.map((l) => /rotation of (-?[\d.]+) degrees/.exec(l)).find(Boolean)
    const quarter = rot ? Math.abs(Math.round(Number(rot[1]) / 90)) % 2 === 1 : false
    let width = dims ? Number(dims[1]) : null
    let height = dims ? Number(dims[2]) : null
    if (quarter) [width, height] = [height, width]
    return {
      width,
      height,
      hasAudio: lines.some((l) => /Stream #\d+:\d+.*Audio:/.test(l)),
      duration: dm ? Number(dm[1]) * 3600 + Number(dm[2]) * 60 + Number(dm[3]) : null,
      videoStream: video ? Number(video[1]) : null,
      videoCodec: video ? video[2] : null,
    }
  })
}
