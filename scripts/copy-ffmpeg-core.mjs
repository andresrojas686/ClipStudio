// Copia el núcleo de ffmpeg.wasm a public/ffmpeg para servirlo localmente.
import { cpSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = resolve(root, 'node_modules/@ffmpeg/core/dist/esm')
const dest = resolve(root, 'public/ffmpeg')

mkdirSync(dest, { recursive: true })
for (const f of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  cpSync(resolve(src, f), resolve(dest, f))
}
console.log('ffmpeg core copiado a public/ffmpeg')
