import montserrat400 from '@fontsource/montserrat/files/montserrat-latin-400-normal.woff2?url'
import montserrat700 from '@fontsource/montserrat/files/montserrat-latin-700-normal.woff2?url'
import { fontFamily, type TextOverlay } from './textOverlay'

/**
 * Renderizador único de las cajas de texto: lo usan la vista previa y la exportación,
 * así el resultado exportado coincide con lo que se ve en el editor.
 * Todas las medidas son relativas al cuadro de salida (W×H): posición y ancho a W, tamaño de letra a H.
 */

let fontsReady: Promise<void> | null = null

/** Carga la fuente incluida (Montserrat) antes de dibujar. */
export function loadTextFonts() {
  return (fontsReady ??= (async () => {
    try {
      const faces = [
        new FontFace('ClipMontserrat', `url(${montserrat400})`, { weight: '400' }),
        new FontFace('ClipMontserrat', `url(${montserrat700})`, { weight: '700' }),
      ]
      await Promise.all(faces.map((f) => f.load()))
      faces.forEach((f) => document.fonts.add(f))
    } catch {
      /* sin la fuente se usa la alternativa (Arial) */
    }
  })())
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export interface TextLayout {
  /** Caja en píxeles del cuadro (sin el margen del contorno). */
  x: number
  y: number
  width: number
  height: number
  lines: { text: string; width: number }[]
  fontPx: number
  lineHeight: number
  pad: number
  /** Margen extra alrededor de la caja (contorno / fondo) para no recortar al rasterizar. */
  margin: number
  font: string
}

const LINE_HEIGHT = 1.22

const fontString = (t: TextOverlay, px: number) => `${t.bold ? 700 : 400} ${px}px ${fontFamily(t.font)}`

let measureCtx: Ctx2D | null = null
function measurer(): Ctx2D {
  if (!measureCtx) {
    measureCtx =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(1, 1).getContext('2d')!
        : document.createElement('canvas').getContext('2d')!
  }
  return measureCtx
}

/** Ajuste de línea por palabras (y por caracteres si una palabra no cabe). */
function wrap(ctx: Ctx2D, text: string, maxW: number) {
  const out: { text: string; width: number }[] = []
  const fits = (s: string) => ctx.measureText(s).width <= maxW
  const push = (l: string) => {
    const s = l.trimEnd()
    out.push({ text: s, width: ctx.measureText(s).width })
  }
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(/(\s+)/).filter((w) => w !== '')) {
      if (/^\s+$/.test(word)) {
        if (line) line += word
        continue
      }
      if (fits((line + word).trimEnd())) {
        line += word
        continue
      }
      if (line.trim()) push(line)
      line = ''
      if (fits(word)) {
        line = word
        continue
      }
      // Palabra más ancha que la caja: se corta por caracteres.
      for (const ch of word) {
        if (line && !fits(line + ch)) {
          push(line)
          line = ''
        }
        line += ch
      }
    }
    push(line)
  }
  return out
}

export function layoutText(t: TextOverlay, W: number, H: number): TextLayout {
  const fontPx = Math.max(1, t.size * H)
  const font = fontString(t, fontPx)
  const ctx = measurer()
  ctx.font = font
  const pad = t.bg === 'box' ? fontPx * 0.3 : 0
  const width = Math.max(1, t.w * W)
  const lines = wrap(ctx, t.text || ' ', Math.max(1, width - pad * 2))
  const lineHeight = fontPx * LINE_HEIGHT
  const height = lines.length * lineHeight + pad * 2
  const margin = t.bg === 'outline' ? Math.ceil(fontPx * 0.12) + 2 : 2
  return { x: t.x * W, y: t.y * H, width, height, lines, fontPx, lineHeight, pad, margin, font }
}

function roundRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
}

/**
 * Dibuja el texto en `ctx`. Por defecto en su posición dentro del cuadro W×H;
 * con `origin` se desplaza (para rasterizarlo en un lienzo del tamaño de la caja).
 */
export function drawText(ctx: Ctx2D, t: TextOverlay, W: number, H: number, origin?: { x: number; y: number }, layout?: TextLayout) {
  const L = layout ?? layoutText(t, W, H)
  const ox = origin ? origin.x : L.x
  const oy = origin ? origin.y : L.y
  ctx.save()
  ctx.font = L.font
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  const inner = L.width - L.pad * 2

  L.lines.forEach((line, i) => {
    const lx = ox + L.pad + (t.align === 'center' ? (inner - line.width) / 2 : t.align === 'right' ? inner - line.width : 0)
    const cy = oy + L.pad + L.lineHeight * (i + 0.5)
    if (t.bg === 'box' && line.text) {
      // Fondo pegado a cada línea (estilo redes sociales).
      ctx.fillStyle = t.bgColor
      ctx.globalAlpha = 0.65
      const bx = lx - L.pad
      const by = cy - L.lineHeight / 2 - (i === 0 ? L.pad : 0)
      const bh = L.lineHeight + (i === 0 ? L.pad : 0) + (i === L.lines.length - 1 ? L.pad : 0)
      roundRect(ctx, bx, by, line.width + L.pad * 2, bh, L.fontPx * 0.18)
      ctx.globalAlpha = 1
    }
    if (t.bg === 'outline' && line.text) {
      ctx.strokeStyle = t.bgColor
      ctx.lineWidth = L.fontPx * 0.16
      ctx.lineJoin = 'round'
      ctx.miterLimit = 2
      ctx.strokeText(line.text, lx, cy)
    }
    ctx.fillStyle = t.color
    ctx.fillText(line.text, lx, cy)
  })
  ctx.restore()
  return L
}

/** Rasteriza el texto en un lienzo del tamaño de su caja; `x`/`y` es dónde va en el cuadro W×H. */
export async function renderTextCanvas(t: TextOverlay, W: number, H: number) {
  await loadTextFonts()
  const L = layoutText(t, W, H)
  const canvas = new OffscreenCanvas(Math.ceil(L.width + L.margin * 2), Math.ceil(L.height + L.margin * 2))
  drawText(canvas.getContext('2d')!, t, W, H, { x: L.margin, y: L.margin }, L)
  return { canvas, x: Math.round(L.x - L.margin), y: Math.round(L.y - L.margin) }
}

/** PNG transparente del texto para superponerlo con ffmpeg. */
export async function renderTextPng(t: TextOverlay, W: number, H: number) {
  const { canvas, x, y } = await renderTextCanvas(t, W, H)
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  return { png: new Uint8Array(await blob.arrayBuffer()), x, y }
}
