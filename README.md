# ClipStudio — Editor de clips de video

Aplicación web para cortar videos y exportarlos listos para redes sociales (TikTok, Instagram Reels, YouTube Shorts,
Instagram Stories, Instagram Feed, YouTube). Todo el procesamiento ocurre **en tu navegador** con
[ffmpeg.wasm](https://ffmpegwasm.netlify.app/) y WebCodecs: el video **nunca se sube a ningún servidor**.

## Índice

- [Características](#características)
- [Requisitos](#requisitos)
- [Instalación en tu PC (paso a paso)](#instalación-en-tu-pc-paso-a-paso)
- [Actualizar a la última versión](#actualizar-a-la-última-versión)
- [Solución de problemas](#solución-de-problemas)
- [Cómo se usa](#cómo-se-usa)
- [Comandos disponibles](#comandos-disponibles)
- [Tecnologías](#tecnologías)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Publicar en internet](#publicar-en-internet)
- [Notas técnicas](#notas-técnicas)
- [Hoja de ruta](#hoja-de-ruta)
- [Licencia](#licencia)

## Características

- **Formatos de entrada:** MP4, MOV, AVI, MKV y WebM (incluidos videos AV1 descargados de YouTube).
- **Dividir en N clips:** al cargar un video eliges cuántos clips quieres y ves antes el inicio, fin y duración de cada uno.
- **Segmentos a mano:** línea de tiempo con forma de onda del audio, marcas de inicio/fin (`I` / `O`) y asas arrastrables.
- **Destinos predefinidos:** TikTok, Reels, Shorts, Stories (9:16), Instagram Feed (4:5), Cuadrado (1:1), YouTube (16:9) u Original.
- **Encuadre:** recorte manual con un recuadro sobre el video, fondo desenfocado, proporción libre y rotación en pasos de 90°.
- **Calidad:** resolución de salida (480p a 4K u original) y bitrate (automático o de 2 a 16 Mbps).
- **Cola de exportación:** exporta los mismos segmentos en varios formatos de una vez, con progreso y descargas por trabajo.
- **Salida:** MP4 (H.264 + AAC) compatible con todas las redes, o el formato original sin re-codificar.

## Requisitos

| Requisito | Versión | Para qué |
|---|---|---|
| [Node.js](https://nodejs.org/) | **22.12 o superior** (o 20.19+) | Instalar dependencias y arrancar la aplicación |
| npm | La que viene con Node.js | Gestor de paquetes |
| [Git](https://git-scm.com/) | Cualquiera reciente (opcional) | Descargar y actualizar el código; también puedes bajar un ZIP |
| Navegador | **Chrome o Edge** actualizados | Ejecutar la app (necesita WebCodecs y WebAssembly) |

Espacio en disco: unos 250 MB para el proyecto con sus dependencias. Memoria: se recomiendan 8 GB de RAM para videos grandes.

## Instalación en tu PC (paso a paso)

Los comandos funcionan igual en **Windows** (PowerShell o Símbolo del sistema), **macOS** y **Linux** (Terminal).

### 1. Instala Node.js

1. Entra en <https://nodejs.org/> y descarga la versión **LTS**.
2. Ejecuta el instalador con las opciones por defecto (en Windows deja marcada la opción *Add to PATH*).
3. Abre una terminal **nueva** y comprueba que quedó instalado:

   ```bash
   node --version
   npm --version
   ```

   Debe mostrar `v22.12.0` o superior para Node.js. Si dice que el comando no existe, cierra y vuelve a abrir la terminal.

### 2. Descarga el código

**Opción A — con Git (recomendada, permite actualizar fácilmente):**

```bash
git clone https://github.com/andresrojas686/ClipStudio.git
cd ClipStudio
```

**Opción B — sin Git:** en <https://github.com/andresrojas686/ClipStudio> pulsa **Code → Download ZIP**,
descomprímelo y abre una terminal dentro de la carpeta descomprimida (en Windows: clic derecho en la carpeta →
*Abrir en Terminal*).

> La rama `main` es la versión estable; `development` contiene lo último en desarrollo.

### 3. Instala las dependencias

Dentro de la carpeta del proyecto:

```bash
npm install
```

Tarda uno o dos minutos la primera vez. Al terminar copia automáticamente el motor de video (ffmpeg.wasm, ~30 MB)
a `public/ffmpeg/`; verás el mensaje `ffmpeg core copiado a public/ffmpeg`.

### 4. Arranca la aplicación

```bash
npm run dev
```

Cuando aparezca `Local: http://localhost:5173/`, la aplicación está lista.

### 5. Ábrela en el navegador

Entra en **<http://localhost:5173>** con Chrome o Edge. Arrastra un video a la ventana y empieza a trabajar.

### 6. Para cerrarla

Vuelve a la terminal y pulsa **Ctrl + C**. La próxima vez solo necesitas los pasos 4 y 5
(abrir una terminal en la carpeta del proyecto y ejecutar `npm run dev`).

### (Opcional) Versión optimizada

La versión de desarrollo es la más cómoda; si prefieres la versión compilada y optimizada:

```bash
npm run build
npm run preview
```

y abre **<http://localhost:4173>**.

## Actualizar a la última versión

Si instalaste con Git, dentro de la carpeta del proyecto:

```bash
git pull
npm install
```

Si descargaste el ZIP, descarga uno nuevo y repite los pasos 3 a 5.

## Solución de problemas

| Problema | Solución |
|---|---|
| `node` o `npm` *no se reconoce como comando* | Node.js no está instalado o la terminal se abrió antes de instalarlo. Cierra la terminal, ábrela de nuevo y repite el paso 1 si sigue fallando. |
| Windows: *la ejecución de scripts está deshabilitada en este sistema* (al usar `npm` en PowerShell) | Usa `npm.cmd` en lugar de `npm` (por ejemplo `npm.cmd install`), o ejecuta los comandos desde el *Símbolo del sistema* (cmd). |
| Error de versión al ejecutar `npm install` o `npm run dev` | Tu Node.js es antiguo. Instala la versión LTS actual (paso 1). |
| *Port 5173 is in use* | Ya hay otra copia corriendo. Ciérrala con Ctrl + C, o arranca en otro puerto: `npm run dev -- --port 5174`. |
| La cabecera muestra **Error del motor** o la exportación no empieza | Falta el motor de video. Ejecuta `node scripts/copy-ffmpeg-core.mjs` y recarga la página. |
| Un video AV1 no se puede exportar | Usa Chrome o Edge actualizados (necesitan WebCodecs). Firefox y Safari antiguos no lo soportan. |
| No funciona al abrirla desde otro equipo de la red (`http://192.168.x.x:5173`) | El navegador solo permite WebCodecs en `localhost` o con HTTPS. Úsala en el mismo PC, o publícala con HTTPS (ver [Publicar en internet](#publicar-en-internet)). |
| El navegador se queda sin memoria con videos muy grandes | Cierra otras pestañas; por encima de ~500 MB el rendimiento depende de la RAM disponible. |

## Cómo se usa

1. **Carga un video:** arrástralo a la ventana o haz clic para elegirlo.
2. **Crea los segmentos:**
   - Al cargar, la app ofrece **dividir el video en N clips iguales**: eliges cuántos y ves el inicio, fin y duración
     de cada uno antes de aplicar (también desde **✂ Dividir en N clips…**).
   - O márcalos a mano con **I** (inicio) y **O** (fin) mientras reproduces, o con **+ Añadir segmento aquí**.
   - Ajusta los bordes arrastrando las asas en la línea de tiempo o escribiendo los tiempos en la lista.
     La **forma de onda** del audio ayuda a encontrar los cortes.
3. **Elige el destino** (preset) o ajusta a mano:
   - **Encuadre:** proporción (original, 9:16, 4:5, 1:1, 16:9 o libre), *recortar* o *fondo desenfocado*, y **rotación**.
     En modo recorte, arrastra y redimensiona el recuadro sobre el video.
   - **Calidad:** resolución de salida y bitrate.
   - **Corte** (solo sin cambios de encuadre ni calidad): *Rápido* sin re-codificar (corta en el fotograma clave anterior)
     o *Preciso* al fotograma.
   - Con varios segmentos: **clips separados** o **un solo video** unido en el orden de la lista.
4. **Exporta:** **Exportar** procesa al momento; **+ A la cola** guarda los ajustes como un trabajo para exportar los
   mismos segmentos en varios formatos de una vez (**Procesar cola**). Descarga cada archivo al terminar.

**Atajos de teclado:** `Espacio` reproducir/pausar · `I` / `O` marcar inicio/fin · `←` / `→` fotograma
(`Shift` = 1 s) · `Supr` borrar el segmento seleccionado.

Si el navegador no puede reproducir el archivo (p. ej. AVI), se genera una vista previa ligera a 480p;
la exportación usa siempre el original.

## Comandos disponibles

| Comando | Qué hace |
|---|---|
| `npm install` | Instala las dependencias y copia el motor de video a `public/ffmpeg/` |
| `npm run dev` | Arranca la app en modo desarrollo en <http://localhost:5173> (se recarga al editar el código) |
| `npm run build` | Compila la versión optimizada en `dist/` |
| `npm run preview` | Sirve la versión compilada en <http://localhost:4173> |
| `npm run lint` | Revisa el código con oxlint |

## Tecnologías

- **React 19 + TypeScript** y **Vite** (servidor de desarrollo y compilación)
- **Tailwind CSS** (estilos) y **Zustand** (estado global)
- **ffmpeg.wasm** (`@ffmpeg/ffmpeg`, `@ffmpeg/core`): corte y conversión dentro del navegador
- **mediabunny** (WebCodecs): conversión de videos AV1 y análisis del audio para la forma de onda

## Estructura del proyecto

```
ClipStudio/
├── docs/
│   └── plan-editor-clips-video.md   Plan del proyecto y fases
├── public/
│   ├── _headers                     Headers COOP/COEP para Netlify / Cloudflare Pages
│   └── ffmpeg/                      Motor ffmpeg.wasm (se genera con npm install; no se versiona)
├── scripts/
│   └── copy-ffmpeg-core.mjs         Copia el motor desde node_modules a public/ffmpeg
├── src/
│   ├── components/   Uploader, VideoPlayer, CropOverlay, Timeline, Waveform, SegmentList, SplitDialog,
│   │                 ExportPanel, ExportSettingsPanel, ExportQueue, ProgressBar
│   ├── hooks/        useFfmpeg (cola de exportación, estado del motor), useVideoState (reproductor ↔ store,
│   │                 vista previa), useWaveform
│   ├── lib/          ffmpegClient (carga, cola, montaje WORKERFS), ffmpegCommands (argumentos FFmpeg),
│   │                 exporter (corte/unión), webcodecsExporter, presets, geometry, splitClips, waveform,
│   │                 formatUtils, colors
│   └── store/        editorStore (Zustand)
├── index.html
├── package.json
├── vercel.json                      Headers COOP/COEP para Vercel
└── vite.config.ts                   Configuración de Vite (incluye los headers en desarrollo)
```

## Publicar en internet

Es un sitio estático: `npm run build` genera la carpeta `dist/`, que se puede publicar en Vercel, Netlify o
Cloudflare Pages. El servidor debe enviar estos headers (ya configurados en `vercel.json` y `public/_headers`):

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Debe servirse por **HTTPS** (todos esos servicios lo hacen por defecto).

## Notas técnicas

- Núcleo **single-thread** de ffmpeg.wasm: corre en su propio Worker, así que la interfaz no se bloquea.
- El archivo de entrada se monta con **WORKERFS**: FFmpeg lo lee directamente del `File`, sin copiarlo a memoria.
- La re-codificación en WebAssembly es lenta (del orden de 2–4× la duración del clip en 9:16 a 1080p).
- **Videos AV1:** el núcleo de ffmpeg.wasm no puede decodificarlos (su decodificador `av1` exige aceleración por
  hardware y no incluye libdav1d). Para ellos la conversión se hace con WebCodecs vía
  [mediabunny](https://mediabunny.dev/) (`src/lib/webcodecsExporter.ts`), usando el decodificador y codificador
  nativos del navegador. El corte *Rápido* sigue usando FFmpeg.
- Tras cualquier fallo de FFmpeg el motor se recarga automáticamente (un `abort()` del wasm lo deja inutilizable).
- La forma de onda se calcula con el decodificador de audio del navegador, por partes; para contenedores que
  mediabunny no lee (p. ej. AVI) se usa FFmpeg como respaldo.

## Hoja de ruta

El plan completo está en [`docs/plan-editor-clips-video.md`](docs/plan-editor-clips-video.md).

| Fase | Contenido | Estado |
|---|---|---|
| 1 (MVP) | Carga, reproductor, línea de tiempo, segmentos, exportación original y 9:16 | ✅ Hecha |
| 2 | Forma de onda, resolución/bitrate, rotación y encuadre, cola, presets | ✅ Hecha (backend > 1 GB pospuesto) |
| 2.5 | Dividir el video en N clips iguales con vista previa | ✅ Hecha |
| 3 | Filtros, texto y stickers, transiciones, guardado de proyectos | Pendiente |

## Licencia

Distribuido bajo la licencia **GNU GPL v3.0**. Consulta el archivo [`LICENSE`](LICENSE).
