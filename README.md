# Video Maker

App de escritorio para Windows (.exe) que crea videos combinando imágenes/MP4, audio de narración y guion con timestamps. Incluye zoom estilo Ken Burns, transiciones, overlays y barra de progreso. Acompañada de una extensión de Chrome "Cola de Prompts" para generar imágenes en Google Flow.

---

## 1. Qué es

- **Video Maker**: App Electron que recibe imágenes, audio y guion → produce MP4 final con efectos.
- **Cola de Prompts**: Extensión Chromium (Manifest V3) que ejecuta prompts en Google Flow uno a uno, esperando a que cada imagen se genere.
- **Build automático**: GitHub Actions compila el .exe en Windows y empaqueta la extensión en .zip, publicando ambos en Releases.

---

## 2. Cómo obtener el .exe sin programar

1. Crea un repositorio en GitHub y sube todo el código de la carpeta `video-maker/`
2. Ve a la pestaña **Actions** → selecciona el workflow "Build Video Maker" → **Run workflow**
3. Cuando termine, en **Artifacts** descarga `videomaker-exe` (contiene el .exe portable e instalador) y `cola-prompts-extension` (el .zip de la extensión)
4. **Opcional**: Crea un tag `v1.0.0` (`git tag v1.0.0 && git push origin v1.0.0`) para generar un Release automático con ambos archivos adjuntos.

---

## 3. Aviso de Windows

El .exe **no está firmado digitalmente**. Al ejecutarlo por primera vez, Windows SmartScreen mostrará "Windows protegió su PC":
- Haz clic en **Más información**
- Luego **Ejecutar de todas formas**

---

## 4. Flujo completo de uso

### Paso 1: Genera guion y prompts con ChatGPT

Copia y pega este prompt en ChatGPT:

> **Del guion, genérame: (1) el guion dividido en escenas con timestamps (M:SS) calculados a ~150 palabras por minuto, escenas de 4 a 8 segundos, y (2) un prompt de imagen en inglés por cada escena, en el mismo orden y con la misma cantidad. Formato: PROMPT 1: …**

ChatGPT te devolverá algo como:
```
(0:00) Primera escena del video...
(0:05) Segunda escena...
(0:11) Tercera escena...

PROMPT 1: A cinematic shot of...
PROMPT 2: Another scene showing...
PROMPT 3: Final scene with...
```

### Paso 2: Ejecuta los prompts en Flow con la extensión

1. Abre [Google Flow](https://labs.google/fx/tools/flow)
2. Abre la extensión **Cola de Prompts** (icono en la barra)
3. **Calibrar**: haz 3 clics en la página (caja de texto → botón Generar → una imagen resultado)
4. Pega los prompts (solo las líneas `PROMPT 1: ...`, `PROMPT 2: ...`, etc.)
5. **Añadir** → **Iniciar**
6. La extensión los ejecutará en secuencia. Descarga las imágenes generadas.

### Paso 3: Genera el audio de voz

Usa tu herramienta TTS preferida (ElevenLabs, Edge TTS, etc.) para generar un archivo MP3 con la narración completa del guion.

### Paso 4: Monta el video en Video Maker

1. Ejecuta `VideoMaker.exe`
2. **Sección 1 - Imágenes**: Arrastra las imágenes descargadas (orden = orden de escenas)
3. **Sección 2 - Audio**: Sube el MP3 de narración (obligatorio) y opcionalmente música de fondo
4. **Sección 3 - Guion**: Pega el guion con timestamps `(M:SS)` de ChatGPT
   - Deja activado "Ajustar tiempos al largo del audio"
5. **Sección 4 - Configuración**: Ajusta resolución (9:16 para Reels/Shorts), zoom, transiciones...
6. **Sección 6 - Línea de tiempo**: **Generar línea de tiempo** → verás la tabla de escenas y el factor de ajuste
7. **Vista previa** (opcional): Render rápido a 540px para revisar
8. **Exportar MP4**: Elige destino, espera la barra de progreso → **Abrir carpeta**

---

## 5. Instalar la extensión

1. Descomprime `cola-prompts-extension.zip`
2. Abre la página de extensiones:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`
   - Opera: `opera://extensions`
3. Activa **Modo de desarrollador** (toggle arriba a la derecha)
4. **Cargar descomprimida** → selecciona la carpeta `extension` descomprimida
5. Fija el icono (chincheta) en la barra de herramientas

> **Firefox no es compatible** (usa Manifest V3 con service workers y APIs específicas de Chromium).

---

## 6. Cómo usar la extensión

1. Abre [Google Flow](https://labs.google/fx/tools/flow)
2. Abre el popup de la extensión
3. **Calibrar** → 3 clics en la página:
   - Caja donde se escribe el prompt
   - Botón "Generar"
   - Una imagen ya generada (cualquier resultado previo)
4. Pega tus prompts (uno por línea, o con prefijo `PROMPT 1: ...`)
5. **Añadir** → verás la cola
6. **Iniciar** → la extensión procesa uno a uno
7. Controles: **Pausar**, **Detener**, **Limpiar**, **Reintentar errores**
8. Verás progreso: `hechos/total`, tiempo restante estimado, barra de progreso

---

## 7. Por qué se ajustan los tiempos

Los timestamps de ChatGPT son **estimados** (~150 palabras/minuto). El audio real suele durar distinto.

**Ejemplo numérico:**
- Guion estimado: 6 escenas × 4s = **24s** (último timestamp en 0:20)
- Audio real: **28.5s**
- Factor = 28.5 / 24 = **1.1875**
- La app multiplica todos los inicios × 1.1875 → proporciones conservadas, video termina exactamente cuando acaba la voz.

Si desactivas "Ajustar tiempos al audio", la última escena se estira/recorta hasta cubrir el audio completo.

---

## 8. Solución de problemas

| Problema | Solución |
|----------|----------|
| La extensión no escribe el prompt | Recalibra (botón Calibrar). Verifica que el selector de input sea único. |
| Se queda "esperando" generando | Revisa selector de imagen resultado y/o `busyIndicator`. Sube el timeout en Ajustes. |
| Imágenes desfasadas vs escenas | Verifica que el orden de imágenes en Video Maker coincida con el orden de prompts en Flow. |
| Error de fuente en franja inferior | Descarga `DejaVuSans-Bold.ttf` en `app/assets/fonts/` (ver repo). En Windows usa fuente del sistema. |
| `E_SCENE_TOO_SHORT` | Aumenta duración de transición o reduce número de escenas. Mínimo = 2×transición + 0.2s. |
| `E_DURATION_MISMATCH` | El factor de reescalado no cuadra. Revisa timestamps del guion. |
| Video final dura distinto al audio | Activa "Ajustar tiempos al audio" o revisa `sceneDurationOverrides`. |

---

## 9. Aviso sobre Flow

La extensión **automatiza la interfaz web de Google Flow** usando tu propia cuenta. Google puede:
- Cambiar el HTML/selectores en cualquier momento (requiere recalibrar)
- Limitar o banear cuentas con uso muy automatizado

Por eso la extensión incluye:
- Delays aleatorios entre prompts (3s + 0-1.5s)
- Pausa automática tras 3 errores seguidos
- Timeouts configurables

**Úsala bajo tu propia responsabilidad y respeta los Términos de Servicio de Google.**

---

## 10. Qué se probó y qué no

| Componente | Probado | No verificado |
|------------|---------|---------------|
| Parser de guion (timestamps, sin timestamps, orden) | ✅ vitest | - |
| Timeline (3 casos, reescalado, overrides, PRNG) | ✅ vitest | - |
| FFmpeg builder (zoom styles, transiciones, overlays) | ✅ unit tests | - |
| Render FFmpeg (lavfi test: color + sine 24s) | ✅ local | Build Windows .exe |
| Electron app (UI, IPC, drag-drop, preview, export) | ✅ `npm start` | Instalador NSIS en Windows real |
| Extensión (mock Flow 5 prompts → 5 done) | ✅ manual | Flow real (sujeto a cambios) |
| GitHub Actions (build.yml sintaxis) | ✅ YAML lint | Ejecución real en Actions |
| README completo (10 secciones) | ✅ | - |

**No verificado en este entorno:**
- Compilación real del .exe en `windows-latest` (GitHub Actions)
- Instalador NSIS funcional
- Flujo completo contra Google Flow real (puede cambiar selectores)
- Firma digital del ejecutable (SmartScreen)

---

## Licencia

Uso personal. Sin garantías.