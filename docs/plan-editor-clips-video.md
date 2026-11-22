# Plan: Editor de Clips de Video para Redes Sociales

## 1. Resumen

Aplicación web que permite al usuario cargar un video (**MP4, MOV, AVI, MKV, WebM**), seleccionar uno o varios segmentos mediante una línea de tiempo, y exportar clips en el formato original o en vertical (**9:16**) optimizado para redes sociales (TikTok, Reels, Shorts).

> **Decisión clave de arquitectura:** procesamiento 100% en el navegador con `ffmpeg.wasm`. El video nunca sale del dispositivo del usuario, lo que elimina costos de servidor, problemas de privacidad y tiempos de subida.

---

## 2. Enfoque técnico

| Enfoque | Ventajas | Desventajas |
|---|---|---|
| **ffmpeg.wasm (cliente)** | Privacidad, sin servidor, sin costos de almacenamiento | Limitado por RAM/CPU del navegador; archivos muy grandes (>1 GB) pueden ser lentos |
| **Servidor + FFmpeg** | Maneja archivos enormes, más rápido | Requiere backend, almacenamiento, costos, subida del video |
| **WebCodecs API** | Muy rápido, nativo | Soporte de formatos limitado, API compleja y aún en evolución |

**Recomendación:** empezar con `ffmpeg.wasm` (cubre el 90% de los casos de uso). Añadir un backend opcional más adelante solo si se detecta demanda de archivos muy pesados.

---

## 3. Stack tecnológico

### Frontend
- **React + TypeScript** — framework principal (alternativa: Vue o Svelte, igual de válidas)
- **Vite** — bundler y dev server
- **Tailwind CSS** — estilos rápidos y consistentes
- **Zustand** — gestión de estado (ligero, sin boilerplate)

### Procesamiento de video
- **`@ffmpeg/ffmpeg` + `@ffmpeg/core`** — FFmpeg compilado a WebAssembly
- **`@ffmpeg/util`** — helpers para cargar archivos y descargar resultados

### UI de línea de tiempo
- Componente custom construido sobre `<canvas>` o SVG (recomendado para control total del trim)
- Alternativa: librerías como `react-timeline-editor` o `wavesurfer.js` (para mostrar la forma de onda del audio)

### Backend (opcional, fase 2)
- **Node.js + Express** — API de procesamiento
- **FFmpeg nativo** en el servidor — para archivos grandes
- **S3 / Cloud Storage** — almacenamiento temporal de clips

---

## 4. Arquitectura

```
┌─────────────────────────────────────────────┐
│                 Navegador                   │
│                                             │
│  ┌──────────┐   ┌──────────┐   ┌─────────┐  │
│  │  Upload  │──▶│ Timeline │──▶│ Export  │  │
│  │  (drag)  │   │ (trim)   │   │ (ffmpeg)│  │
│  └──────────┘   └──────────┘   └─────────┘  │
│        │              │              │      │
│        ▼              ▼              ▼      │
│  ┌──────────────────────────────────────┐   │
│  │        ffmpeg.wasm (WebAssembly)     │   │
│  │   - corte por segmentos              │   │
│  │   - transcode a MP4/H.264            │   │
│  │   - crop/scale a 9:16                │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

---

## 5. Funcionalidades

### MVP (Fase 1)
- [ ] Carga de archivos por drag & drop o selector (MP4, MOV, AVI, MKV, WebM)
- [ ] Reproductor de video con controles (play, pausa, seek)
- [ ] Línea de tiempo con marcadores de inicio y fin (trim)
- [ ] Selección de múltiples segmentos para cortar
- [ ] Exportación en formato original (mismo códec y resolución)
- [ ] Exportación en vertical 9:16 con dos modos:
  - **Crop central** (recorta los lados)
  - **Blur-pad** (fondo desenfocado arriba/abajo, video completo centrado)
- [ ] Descarga del clip resultante
- [ ] Barra de progreso del procesamiento

### Fase 2
- [ ] Forma de onda del audio en la línea de tiempo
- [ ] Ajuste de resolución y bitrate de salida
- [ ] Rotación y recorte manual (crop libre)
- [ ] Cola de exportación (procesar varios clips en lote)
- [ ] Presets por red social (TikTok, Reels, Shorts, Stories)
- [ ] Backend para archivos > 1 GB

### Fase 3
- [ ] Filtros y ajustes básicos (brillo, contraste, saturación)
- [ ] Texto superpuesto y stickers
- [ ] Transiciones entre segmentos
- [ ] Guardado de proyectos en el navegador (IndexedDB)

---

## 6. Plan de desarrollo por fases

### Fase 0 — Preparación *(1-2 días)*
- Configurar proyecto con Vite + React + TypeScript
- Instalar dependencias de `ffmpeg.wasm`
- Configurar Tailwind CSS
- Estructura de carpetas y linting

### Fase 1 — Carga y reproducción *(2-3 días)*
- Componente de upload con drag & drop
- Validación de formatos y tamaño
- Reproductor con `<video>` y controles
- Carga del archivo al filesystem virtual de `ffmpeg.wasm`

### Fase 2 — Línea de tiempo y trim *(3-5 días)*
- Componente de timeline (canvas/SVG)
- Marcadores de inicio/fin arrastrables
- Sincronización timeline ↔ reproductor
- Selección de múltiples segmentos

### Fase 3 — Procesamiento y exportación *(3-5 días)*
- Comandos FFmpeg para corte por segmentos
- Transcodificación a MP4/H.264 (compatibilidad universal)
- Modo vertical: crop central y blur-pad
- Descarga del resultado con barra de progreso

### Fase 4 — Pulido y despliegue *(2-3 días)*
- Manejo de errores y estados de carga
- Optimización de rendimiento (workers, memoria)
- Diseño responsive
- Despliegue en Vercel / Netlify / Cloudflare Pages

> **Total estimado:** 11-18 días de trabajo para un MVP sólido.

---

## 7. Estructura del proyecto

```
video-clip-editor/
├── src/
│   ├── components/
│   │   ├── Uploader.tsx
│   │   ├── VideoPlayer.tsx
│   │   ├── Timeline.tsx
│   │   ├── SegmentList.tsx
│   │   └── ExportPanel.tsx
│   ├── hooks/
│   │   ├── useFfmpeg.ts        # carga y gestión de ffmpeg.wasm
│   │   └── useVideoState.ts
│   ├── lib/
│   │   ├── ffmpegCommands.ts   # comandos de corte y conversión
│   │   └── formatUtils.ts
│   ├── store/
│   │   └── editorStore.ts      # estado global (Zustand)
│   ├── App.tsx
│   └── main.tsx
├── public/
│   └── ffmpeg/                 # core wasm (o servido por CDN)
├── package.json
└── vite.config.ts
```

---

## 8. Comandos FFmpeg clave

**Corte de un segmento (sin re-codificar, rápido):**

```bash
ffmpeg -ss 00:00:10 -to 00:00:25 -i input.mp4 -c copy output.mp4
```

**Corte + conversión a vertical 9:16 (crop central):**

```bash
ffmpeg -ss 00:00:10 -to 00:00:25 -i input.mp4 \
  -vf "crop=ih*9/16:ih,scale=1080:1920" \
  -c:v libx264 -c:a aac output.mp4
```

**Vertical con fondo desenfocado (blur-pad):**

```bash
ffmpeg -ss 00:00:10 -to 00:00:25 -i input.mp4 \
  -filter_complex "[0:v]split=2[bg][fg];[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:5[bg2];[fg]scale=1080:-1[fg2];[bg2][fg2]overlay=(W-w)/2:(H-h)/2" \
  -c:v libx264 -c:a aac output.mp4
```

---

## 9. Consideraciones técnicas importantes

- **Formato de salida:** siempre exportar a **MP4/H.264 + AAC**, que es el formato universalmente compatible con todas las redes sociales, independientemente del formato de entrada.
- **Rendimiento:** ejecutar `ffmpeg.wasm` en un **Web Worker** para no bloquear la interfaz. Usar `SharedArrayBuffer` (requiere headers COOP/COEP) para transferir datos sin copias.
- **Memoria:** los videos grandes consumen mucha RAM. Establecer un límite de tamaño (p. ej. **500 MB**) en el MVP y mostrar advertencia.
- **Corte sin re-codificar (`-c copy`):** es instantáneo pero solo funciona en puntos clave (keyframes). Para precisión de frame exacto, se necesita re-codificar. Ofrecer ambas opciones.
- **AVI y MKV:** `ffmpeg.wasm` los lee sin problema, pero la salida siempre será MP4.
- **Headers COOP/COEP:** necesarios para multithreading de `ffmpeg.wasm`. Configurarlos en el hosting (Vercel/Netlify lo permiten).

---

## 10. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Archivos grandes agotan la memoria | Límite de tamaño + backend opcional en fase 2 |
| Corte impreciso con `-c copy` | Ofrecer re-codificación para precisión de frame |
| Carga inicial de `ffmpeg.wasm` (~30 MB) | Lazy-loading + indicador de carga |
| Incompatibilidad de códecs raros | Transcodificar siempre a H.264/AAC |
| Bloqueo de UI durante el procesamiento | Web Worker + barra de progreso |

---

## 11. Conclusión

El proyecto es **completamente viable** y puede construirse como una aplicación 100% cliente, sin backend, gracias a `ffmpeg.wasm`. El MVP (carga, trim, corte y exportación vertical) es alcanzable en **2-3 semanas** de desarrollo. La pieza más compleja es la **línea de tiempo interactiva**, mientras que el procesamiento de video está resuelto por FFmpeg.
