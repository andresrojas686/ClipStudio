import { useFfmpeg } from '../hooks/useFfmpeg'
import { effectiveSettings, needsBrowserDecoder } from '../lib/exporter'
import { formatTime, getExtension } from '../lib/formatUtils'
import { describeOutput } from '../lib/geometry'
import { formatSpeed, isStreamCopy } from '../lib/presets'
import { touchesRange } from '../lib/textOverlay'
import { useEditor } from '../store/editorStore'
import { ExportQueue } from './ExportQueue'
import { ExportSettingsPanel } from './ExportSettingsPanel'

export function ExportPanel() {
  const file = useEditor((s) => s.file)
  const segments = useEditor((s) => s.segments)
  const rawSettings = useEditor((s) => s.settings)
  const texts = useEditor((s) => s.texts)
  const crop = useEditor((s) => s.crop)
  const info = useEditor((s) => s.info)
  const queueRunning = useEditor((s) => s.queueRunning)
  const { exportNow, enqueue } = useFfmpeg()

  // Con textos en los segmentos, el corte rápido pasa a preciso (hay que re-codificar para grabarlos).
  const settings = effectiveSettings(rawSettings, texts, segments)
  const textCount = texts.filter((t) => segments.some((s) => touchesRange(t, s.start, s.end))).length
  const forcedEncode = isStreamCopy(rawSettings) && !isStreamCopy(settings)
  const ext = file ? getExtension(file.name) : ''
  const copy = isStreamCopy(settings)
  const browserDecode = needsBrowserDecoder(info, settings)
  const clips = segments.length > 1 && settings.combine === 'separate' ? `${segments.length} clips` : 'clip'

  return (
    <section className="flex flex-col gap-4">
      <ExportSettingsPanel />

      <p className="text-xs text-zinc-500">
        Salida: {describeOutput(settings, crop, info?.width ?? null, info?.height ?? null, ext)}
        {textCount > 0 && ` · ${textCount} texto${textCount > 1 ? 's' : ''}`}
        {settings.speed !== 1 && segments.length > 0 && (
          <>
            {' · '}
            <strong className="text-violet-300">a {formatSpeed(settings.speed)}</strong>
            {` · duración final ${formatTime(segments.reduce((a, s) => a + s.end - s.start, 0) / settings.speed, 1)}`}
          </>
        )}
        {!copy && !browserDecode && ' · re-codificar en el navegador puede tardar varias veces la duración del clip.'}
      </p>
      {forcedEncode && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200 ring-1 ring-amber-500/30">
          Hay textos dentro de los segmentos: el corte <strong>Rápido</strong> no puede grabarlos, así que se re-codificará
          (corte preciso).
        </p>
      )}
      {browserDecode && (
        <p className="rounded-lg bg-sky-500/10 px-3 py-2 text-xs text-sky-200 ring-1 ring-sky-500/30">
          Este video es <strong>{info?.videoCodec?.toUpperCase()}</strong>: se convertirá con el decodificador nativo del
          navegador (WebCodecs) en lugar de ffmpeg.wasm.
        </p>
      )}

      {segments.length === 0 ? (
        <button type="button" className="btn-primary py-3 text-base" disabled>
          Añade al menos un segmento
        </button>
      ) : (
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <button type="button" className="btn-primary py-3 text-base" onClick={exportNow}>
            {queueRunning ? `Exportar ${clips} (se añade a la cola)` : `Exportar ${clips}`}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={enqueue}
            title="Guarda estos ajustes como un trabajo; procésalos todos juntos después"
          >
            + A la cola
          </button>
        </div>
      )}

      <ExportQueue />
    </section>
  )
}
