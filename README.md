# Editor de clips

Aplicación web para cortar videos y exportarlos en formato original o vertical 9:16 (TikTok, Reels, Shorts).
Todo el procesamiento ocurre en el navegador con [ffmpeg.wasm](https://ffmpegwasm.netlify.app/): el video nunca sale del dispositivo.

## Uso

1. Arrastra un video (MP4, MOV, AVI, MKV, WebM; recomendado ≤ 500 MB).
2. Marca segmentos con **I** / **O** mientras reproduces, o con “Añadir segmento aquí”. Ajusta los bordes arrastrando las asas o escribiendo los tiempos.
3. Elige formato y exporta:
   - **Original · Rápido**: sin re-codificar (instantáneo, corta en el keyframe anterior, mismo contenedor).
   - **Original · Preciso**: re-codifica a MP4 H.264/AAC, exacto al fotograma.
   - **Vertical 9:16**: 1080×1920, *recorte central* o *fondo desenfocado*.
   - Con varios segmentos: **clips separados** o **un solo video** unido en el orden de la lista.

Atajos: `Espacio` reproducir/pausar · `I`/`O` inicio/fin · `←`/`→` fotograma (`Shift` = 1 s) · `Supr` borrar segmento seleccionado.

Si el navegador no puede reproducir el archivo (p. ej. AVI), se genera una vista previa ligera a 480p; la exportación usa siempre el original.

## Desarrollo

```bash
npm install      # también copia el núcleo de ffmpeg.wasm a public/ffmpeg
npm run dev      # http://localhost:5173
npm run lint
npm run build    # salida en dist/
```

Requiere Node 20+.

## Despliegue

Es un sitio estático (`dist/`). El servidor debe enviar estos headers (ya incluidos en `vercel.json` y `public/_headers` para Netlify/Cloudflare Pages):

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

## Estructura

```
src/
├── components/   Uploader, VideoPlayer, Timeline, SegmentList, ExportPanel, ProgressBar
├── hooks/        useFfmpeg (exportar/cancelar, estado del motor), useVideoState (reproductor ↔ store, proxy)
├── lib/          ffmpegClient (carga, cola, montaje WORKERFS), ffmpegCommands (argumentos FFmpeg),
│                 exporter (flujo de corte/unión), formatUtils, colors
└── store/        editorStore (Zustand)
```

## Notas técnicas

- Núcleo **single-thread** de ffmpeg.wasm: corre en su propio Worker, así que la interfaz no se bloquea.
- El archivo de entrada se monta con **WORKERFS**: FFmpeg lo lee directamente del `File`, sin copiarlo a memoria.
- La re-codificación en WebAssembly es lenta (orden de 2–4× la duración del clip en 9:16 a 1080p).
- **Videos AV1** (habituales en descargas de YouTube): el núcleo de ffmpeg.wasm no puede decodificarlos
  (su decodificador `av1` exige aceleración por hardware y no incluye libdav1d). Para ellos la conversión se hace
  con WebCodecs vía [mediabunny](https://mediabunny.dev/) (`src/lib/webcodecsExporter.ts`), que usa el
  decodificador/codificador nativo del navegador. Requiere Chrome o Edge recientes. El corte “Rápido” sigue usando FFmpeg.
- Tras cualquier fallo de FFmpeg el motor se recarga automáticamente (un `abort()` del wasm lo deja inutilizable).
