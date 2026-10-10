# Cola de Prompts para Flow - Extensión de Chrome

Extensión Manifest V3 para automatizar el envío secuencial de prompts a Google Flow.

## Instalación

1. Descarga y descomprime `cola-prompts-extension.zip`
2. Abre `chrome://extensions` (o `edge://extensions`, `brave://extensions`, `opera://extensions`)
3. Activa **Modo de desarrollador** (esquina superior derecha)
4. Haz clic en **Cargar descomprimida**
5. Selecciona la carpeta `extension` descomprimida
6. Fija el icono en la barra de herramientas

> **Nota:** Firefox no es compatible (usa Manifest V3 con service workers y APIs específicas de Chromium).

## Uso

1. Abre [Google Flow](https://labs.google/fx/tools/flow)
2. Haz clic en el icono de la extensión
3. **Calibra** (3 clics):
   - Caja de texto del prompt
   - Botón "Generar"
   - Una imagen ya generada (resultado)
4. Pega tus prompts (uno por línea o formato `PROMPT 1: ...`)
5. **Añadir** → **Iniciar**

## Funcionamiento

- Guarda la cola en `chrome.storage.local`
- Procesa un prompt a la vez
- **Espera a que la imagen termine** antes del siguiente (detecta nuevas imágenes + `img.complete` + indicador de carga)
- Reintenta automáticamente (configurable)
- Pausa/Reanuda/Detiene
- Persiste al recargar la pestaña
- Pausa automática tras 3 errores seguidos

## Ajustes

- **Delay entre prompts**: 3000ms por defecto (+ aleatorio 0-1500ms)
- **Timeout por prompt**: 180000ms (3 min)
- **Reintentos máximos**: 2
- **Imágenes por prompt**: 1

## Exportar/Importar

- **Exportar estado .json**: Guarda la cola completa con estado
- **Importar .txt/.json**: Carga prompts o estado completo

## Selectores

La calibración genera selectores CSS robustos priorizando:
1. `id` estable
2. `data-*`, `aria-label`, `role`, `placeholder`
3. Clases cortas
4. Ruta `tag:nth-of-type` (máx. 4 niveles)

Para la imagen de resultado usa un selector genérico que coincida con **todas** las imágenes generadas.

## Escritura de prompts

Maneja tres tipos de elementos:
- `textarea`/`input`: Setter nativo + eventos `input`/`change`
- `contenteditable`: `execCommand('insertText')` + `InputEvent`
- Otros: `textContent` + `InputEvent`

Verifica el texto a los 400ms y reintenta una vez si falla.

## Detección de fin de generación

Combina:
1. Conteo de imágenes nuevas ≥ `imagesPerPrompt` + `img.complete` + `naturalWidth > 0`
2. Indicador de carga (`busyIndicator`) desaparecido
3. `MutationObserver` + `setInterval` 500ms respaldo
4. **Estabilidad**: 1.5s sin cambios en el conteo
5. Timeout → error `TIMEOUT`
6. Alertas/toasts de error → error `FLOW_ERROR`

## Pruebas

Abre `test/mock-flow.html` en el navegador y usa la extensión contra él. Una cola de 5 prompts debe terminar con 5 `done` en orden.

## Limitaciones y responsabilidad

- Automatiza la interfaz web de Flow con tu cuenta
- Google puede cambiar la página o limitar cuentas con uso automatizado
- Incluye delays aleatorios y pausa tras 3 errores
- **Úsala bajo tu propia responsabilidad y respeta los Términos de Servicio de Google**