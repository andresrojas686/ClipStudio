import type { ReactNode } from 'react'
import {
  CUSTOM_PRESET_ID,
  formatSpeed,
  isPassThrough,
  PRESETS,
  SPEEDS,
  usesCrop,
  type Aspect,
  type Bitrate,
  type Resolution,
  type Rotation,
} from '../lib/presets'
import { useEditor } from '../store/editorStore'

const ASPECTS: { value: Aspect; label: string }[] = [
  { value: 'original', label: 'Original' },
  { value: '9:16', label: '9:16' },
  { value: '4:5', label: '4:5' },
  { value: '1:1', label: '1:1' },
  { value: '16:9', label: '16:9' },
  { value: 'free', label: 'Libre' },
]

const RESOLUTIONS: { value: Resolution; label: string }[] = [
  { value: 'source', label: 'Original (sin escalar)' },
  { value: 2160, label: '2160p (4K)' },
  { value: 1440, label: '1440p' },
  { value: 1080, label: '1080p' },
  { value: 720, label: '720p' },
  { value: 480, label: '480p' },
]

const BITRATES: { value: Bitrate; label: string }[] = [
  { value: 'auto', label: 'Automático (calidad constante)' },
  { value: 16, label: '16 Mbps' },
  { value: 12, label: '12 Mbps' },
  { value: 8, label: '8 Mbps' },
  { value: 6, label: '6 Mbps' },
  { value: 4, label: '4 Mbps' },
  { value: 2, label: '2 Mbps' },
]

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">{title}</h3>
        {aside}
      </div>
      {children}
    </div>
  )
}

function Chip({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1.5 text-left text-sm ring-1 transition ${
        active ? 'bg-violet-500/15 ring-violet-500' : 'bg-zinc-900 ring-zinc-800 hover:ring-zinc-600'
      }`}
    >
      {children}
    </button>
  )
}

export function ExportSettingsPanel() {
  const settings = useEditor((s) => s.settings)
  const setSettings = useEditor((s) => s.setSettings)
  const choosePreset = useEditor((s) => s.choosePreset)
  const setCrop = useEditor((s) => s.setCrop)
  const crop = useEditor((s) => s.crop)
  const segments = useEditor((s) => s.segments)


  // Se lee el valor actual del store (no el del render) para que clics rápidos se acumulen bien.
  const rotate = (delta: 90 | -90) => {
    const current = useEditor.getState().settings.rotation
    setSettings({ rotation: ((((current + delta) % 360) + 360) % 360) as Rotation })
  }

  return (
    <div className="flex flex-col gap-4">
      <Section title="Destino">
        <div className="grid grid-cols-2 gap-1.5">
          {PRESETS.map((p) => (
            <Chip key={p.id} active={settings.presetId === p.id} onClick={() => choosePreset(p)} title={p.hint}>
              <span className="block font-medium">{p.name}</span>
              <span className="block text-xs text-zinc-400">{p.hint}</span>
            </Chip>
          ))}
        </div>
        {settings.presetId === CUSTOM_PRESET_ID && <p className="text-xs text-violet-300">Personalizado</p>}
      </Section>

      <Section
        title="Encuadre"
        aside={
          <div className="flex items-center gap-1">
            <button type="button" className="btn-icon" title="Rotar a la izquierda" onClick={() => rotate(-90)}>
              ⟲
            </button>
            <span className="w-9 text-center font-mono text-xs text-zinc-400">{settings.rotation}°</span>
            <button type="button" className="btn-icon" title="Rotar a la derecha" onClick={() => rotate(90)}>
              ⟳
            </button>
          </div>
        }
      >
        <div className="flex flex-wrap gap-1.5">
          {ASPECTS.map((a) => (
            <Chip
              key={a.value}
              active={settings.aspect === a.value}
              onClick={() => setSettings({ aspect: a.value, ...(a.value === 'free' ? { fit: 'crop' } : {}) })}
            >
              {a.label}
            </Chip>
          ))}
        </div>
        {settings.aspect !== 'original' && settings.aspect !== 'free' && (
          <div className="grid grid-cols-2 gap-1.5">
            <Chip active={settings.fit === 'crop'} onClick={() => setSettings({ fit: 'crop' })}>
              <span className="block font-medium">Recortar</span>
              <span className="block text-xs text-zinc-400">Llena la pantalla</span>
            </Chip>
            <Chip active={settings.fit === 'blur'} onClick={() => setSettings({ fit: 'blur' })}>
              <span className="block font-medium">Fondo desenfocado</span>
              <span className="block text-xs text-zinc-400">Video completo</span>
            </Chip>
          </div>
        )}
        {usesCrop(settings) && (
          <p className="flex items-center justify-between gap-2 text-xs text-zinc-400">
            <span>Arrastra el recuadro sobre el video para elegir el encuadre.</span>
            <button type="button" className="text-violet-300 hover:underline disabled:opacity-40" disabled={!crop} onClick={() => setCrop(null)}>
              Centrar
            </button>
          </p>
        )}
      </Section>

      <Section title="Calidad">
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Resolución
            <select
              className="rounded-lg bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 ring-1 ring-zinc-800"
              value={String(settings.resolution)}
              onChange={(e) => setSettings({ resolution: (e.target.value === 'source' ? 'source' : Number(e.target.value)) as Resolution })}
            >
              {RESOLUTIONS.map((r) => (
                <option key={r.value} value={String(r.value)}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Bitrate de video
            <select
              className="rounded-lg bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 ring-1 ring-zinc-800"
              value={String(settings.bitrate)}
              onChange={(e) => setSettings({ bitrate: (e.target.value === 'auto' ? 'auto' : Number(e.target.value)) as Bitrate })}
            >
              {BITRATES.map((b) => (
                <option key={b.value} value={String(b.value)}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Section>

      <Section title="Velocidad">
        <div className="grid grid-cols-4 gap-1.5">
          {SPEEDS.map((sp) => (
            <Chip key={sp} active={settings.speed === sp} onClick={() => setSettings({ speed: sp })}>
              <span className="block text-center font-medium">{formatSpeed(sp)}</span>
            </Chip>
          ))}
        </div>
        {settings.speed !== 1 && (
          <p className="text-xs text-zinc-500">
            {settings.speed > 1 ? 'Más rápido' : 'Cámara lenta'}: el audio cambia de ritmo sin cambiar el tono.
          </p>
        )}
      </Section>

      {isPassThrough(settings) && (
        <Section title="Corte">
          <div className="grid grid-cols-2 gap-1.5">
            <Chip active={settings.cutMode === 'fast'} onClick={() => setSettings({ cutMode: 'fast' })}>
              <span className="block font-medium">Rápido</span>
              <span className="block text-xs text-zinc-400">Sin re-codificar; corta en keyframes</span>
            </Chip>
            <Chip active={settings.cutMode === 'precise'} onClick={() => setSettings({ cutMode: 'precise' })}>
              <span className="block font-medium">Preciso</span>
              <span className="block text-xs text-zinc-400">Re-codifica; exacto al fotograma</span>
            </Chip>
          </div>
        </Section>
      )}

      {segments.length > 1 && (
        <Section title="Varios segmentos">
          <div className="grid grid-cols-2 gap-1.5">
            <Chip active={settings.combine === 'separate'} onClick={() => setSettings({ combine: 'separate' })}>
              <span className="block font-medium">Clips separados</span>
              <span className="block text-xs text-zinc-400">{segments.length} archivos</span>
            </Chip>
            <Chip active={settings.combine === 'merge'} onClick={() => setSettings({ combine: 'merge' })}>
              <span className="block font-medium">Un solo video</span>
              <span className="block text-xs text-zinc-400">En el orden de la lista</span>
            </Chip>
          </div>
        </Section>
      )}
    </div>
  )
}
