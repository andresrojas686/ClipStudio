// Descarga el ejecutable oficial de yt-dlp a bin/ (importación desde YouTube, solo uso local).
// Uso: node scripts/fetch-yt-dlp.mjs [--force]
// Nunca rompe `npm install`: si falla, solo avisa.
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const isWin = process.platform === 'win32'
const isMac = process.platform === 'darwin'
const asset = isWin ? 'yt-dlp.exe' : isMac ? 'yt-dlp_macos' : 'yt-dlp'
const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`
const dest = resolve(root, 'bin', isWin ? 'yt-dlp.exe' : 'yt-dlp')
const force = process.argv.includes('--force')

// yt-dlp necesita un ffmpeg nativo para unir video y audio: lo aporta `ffmpeg-static`.
// Las versiones recientes de npm pueden saltarse su script de instalación; aquí lo forzamos.
try {
  const ffmpegPath = (await import('ffmpeg-static')).default
  if (ffmpegPath && !existsSync(ffmpegPath)) {
    console.log('Descargando ffmpeg nativo (ffmpeg-static) …')
    const pkgDir = resolve(root, 'node_modules/ffmpeg-static')
    spawnSync(process.execPath, ['install.js'], { cwd: pkgDir, stdio: 'inherit' })
  }
} catch {
  console.warn('⚠ ffmpeg-static no está instalado; la importación desde YouTube no podrá unir video y audio.')
}

if (existsSync(dest) && !force) {
  console.log('yt-dlp ya está en bin/ (usa `npm run update-ytdlp` para actualizarlo)')
  process.exit(0)
}

try {
  console.log(`Descargando yt-dlp desde ${url} …`)
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = Buffer.from(await res.arrayBuffer())
  mkdirSync(dirname(dest), { recursive: true })
  const tmp = `${dest}.download`
  writeFileSync(tmp, data)
  if (!isWin) chmodSync(tmp, 0o755)
  rmSync(dest, { force: true })
  renameSync(tmp, dest)
  console.log(`yt-dlp listo en bin/ (${(data.length / 1024 / 1024).toFixed(1)} MB)`)
} catch (err) {
  console.warn(`⚠ No se pudo descargar yt-dlp: ${err instanceof Error ? err.message : err}`)
  console.warn('  La importación desde YouTube no estará disponible hasta ejecutar `npm run update-ytdlp`')
  console.warn('  (o instalar yt-dlp en el PATH, p. ej. `winget install yt-dlp`).')
}
