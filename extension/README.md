# Cola de prompts — Extensión Universal (v2.0.0)

Extensión de Chromium (Chrome, Edge, Brave, Opera) que ejecuta una lista de prompts en **cualquier página web** que tenga una caja de texto y un botón de enviar. Funciona con generadores de imágenes, chats de IA, formularios, etc.

## Instalación

1. Descarga y descomprime `cola-prompts-extension.zip`
2. Abre la página de extensiones:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`
   - Opera: `opera://extensions`
3. Activa **Modo de desarrollador** (esquina superior derecha)
4. Haz clic en **Cargar descomprimida**
5. Selecciona la carpeta que contiene `manifest.json` (aunque el diálogo diga "ningún elemento coincide", pulsa **Seleccionar carpeta**)
6. Fija el icono en la barra con el pin

> **Firefox no es compatible** (usa Manifest V3 con `activeTab` + `scripting` + inyección bajo demanda).

## Uso rápido

1. Abre la web donde quieres enviar los prompts (ej. generador de imágenes, chat IA, etc.)
2. Haz clic en el icono de la extensión → se abre el popup
3. La extensión **se inyecta sola** en la pestaña activa (permiso `activeTab`)
4. Pulsa **Detectar** → verás recuadros azules/verdes en la página (`CAJA` y `ENVIAR`)
5. Si la detección es correcta: pega tus prompts (uno por línea o `PROMPT 1: ...`), **Añadir**, **Iniciar**
6. Si detecta mal: **Siguiente candidato** / **Siguiente botón**, o **Elegir yo** (un clic en la página)
7. La cola sigue corriendo aunque cierres el popup

## Si detecta mal

- **Siguiente candidato** → ciclo entre los 5 mejores candidatos de caja/botón
- **Elegir yo (caja/botón)** → modo manual: clic en el elemento correcto, se guarda perfil por web
- **Olvidar esta web** → borra el perfil guardado para ese hostname

## Si se recarga la página

1. Vuelve a abrir el popup
2. Verás: *"La página se recargó. Pulsa ▶ Iniciar para continuar"*
3. Pulsa **Iniciar** → la cola continúa desde donde estaba (los `running` huérfanos vuelven a `pending`)

## Después de actualizar archivos

1. En `chrome://extensions` pulsa el icono **⟳ Recargar** de "Cola de prompts"
2. Abre el popup y comprueba que en el pie dice `v2.0.0`

## Ajustes (en el popup)

- **Pausa entre prompts** (segundos, default 3)
- **Timeout por prompt** (segundos, default 180)
- **Reintentos máximos** (default 2)
- **Resultados por prompt** 1–4 (default 1)
- **Enviar con**: `Automático` (botón si score≥6, si no Enter) | `Botón` | `Enter` | `Ctrl+Enter`

## Exportar / Importar

- **Exportar estado .json** → guarda cola completa + ajustes + perfiles
- **Importar .txt/.json** → carga prompts o estado completo

## Diagnóstico

Abre **Diagnóstico** en el popup → **Copiar diagnóstico** → comparte el JSON si algo falla.

## Pruebas incluidas

Carpeta `test/mock-pages/` con 6 páginas HTML estáticas:
1. `a-textarea-icono.html` — textarea + botón solo-icono
2. `b-contenteditable.html` — contenteditable + flecha SVG
3. `c-buscador-y-prompt.html` — input search arriba + textarea abajo (debe elegir textarea)
4. `d-shadow-dom.html` — formulario dentro de shadow root
5. `e-muchos-botones.html` — botones Adjuntar, Micrófono, Ajustes, Enviar (type=submit)
6. `f-generador-simulado.html` — 3 variantes funcionales (añade, reemplaza, miniatura+avatar)

### Ejecutar tests

```bash
npm test
```
> Usa `jsdom` (devDependency). Si Playwright no está disponible, los tests corren con `jsdom` + `window.__rectOf` en fixtures con `data-rect`.

## Limitaciones y responsabilidad

- Automatiza la web **con tu propia cuenta**
- Las webs pueden cambiar su HTML, limitar cuentas o banear por uso automatizado
- Incluye pausas aleatorias, reintentos y pausa tras 3 errores
- **Úsalo bajo tu responsabilidad y respeta los Términos de Servicio de cada web**

## Qué se probó / qué NO

| Componente | Probado | No verificado |
|------------|---------|---------------|
| Detección automática (jsdom) | ✅ 6 páginas mock | Sitios reales |
| Selector con shadow DOM | ✅ | Navegadores sin shadow DOM abierto |
| Inyección bajo demanda | ✅ local | Permisos enterprise restrictivos |
| Bucle de cola + reanudar | ✅ local | Recargas en navegadores gestionados |
| Export/Import JSON | ✅ | - |
| Manifest v2.0.0 | ✅ validación JSON | - |

**No verificado en este entorno:** Chrome/Edge/Brave/Opera reales, sitios con CSP estricto, iframes cross-origin, shadow DOM cerrado.

---

**Versión:** 2.0.0  
**Autor:** Elvis-Optimizer0  
**Licencia:** Uso personal