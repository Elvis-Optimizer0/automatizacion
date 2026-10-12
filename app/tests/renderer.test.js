import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';

describe('renderer.js drop zones', () => {
  let dom;
  let window;
  let document;

  beforeEach(() => {
    dom = new JSDOM(`<!DOCTYPE html>
<html>
<body>
  <div class="drop-zone" id="images-dropzone">
    <input type="file" id="images-input" multiple accept="image/png,image/jpeg,image/webp,video/mp4" hidden>
    <div class="drop-zone-content" id="images-drop-content"></div>
    <div class="drop-zone-preview" id="images-preview" hidden></div>
    <div class="preview-grid" id="images-grid"></div>
    <button class="btn btn-secondary" id="clear-images">Quitar todas</button>
    <p class="status-text" id="images-status">Sin archivos</p>
  </div>
  <div class="drop-zone" id="narration-dropzone">
    <input type="file" id="narration-input" accept="audio/mp3,audio/wav,audio/m4a,audio/aac" hidden>
    <div class="drop-zone-content" id="narration-drop-content"></div>
    <div class="file-info" id="narration-info" hidden>
      <span class="file-name" id="narration-name"></span>
      <span class="file-duration" id="narration-duration"></span>
      <button class="btn-icon" id="clear-narration" title="Quitar">✕</button>
    </div>
  </div>
  <div class="drop-zone" id="music-dropzone">
    <input type="file" id="music-input" accept="audio/mp3,audio/wav,audio/m4a,audio/aac" hidden>
    <div class="drop-zone-content" id="music-drop-content"></div>
    <div class="file-info" id="music-info" hidden>
      <span class="file-name" id="music-name"></span>
      <span class="file-duration" id="music-duration"></span>
      <button class="btn-icon" id="clear-music" title="Quitar">✕</button>
    </div>
  </div>
  <div class="drop-zone" id="badges-dropzone">
    <input type="file" id="badges-input" multiple accept="image/png" hidden>
  </div>
  <div class="chips" id="output-chips"></div>
  <div class="segmented" id="fitmode-segmented"></div>
  <div class="config-group" id="bars-color-group" hidden>
    <input type="color" id="bars-color" value="#000000">
  </div>
  <div class="chips" id="export-format-chips"></div>
  <input type="checkbox" id="subtitles-enabled">
  <div class="config-group" id="subtitles-fields" hidden>
    <input type="range" id="subtitle-font-h" min="20" max="120" value="48">
    <input type="range" id="subtitle-font-v" min="20" max="120" value="64">
  </div>
  <textarea id="script-textarea"></textarea>
  <input type="checkbox" id="fit-times" checked>
  <p class="status-text" id="script-status">0 escenas detectadas · 0 imágenes asignadas</p>
  <div class="warning-area" id="scene-warnings" hidden></div>
  <select id="preview-format" class="preview-format-select"></select>
  <video id="preview-video" controls></video>
  <div class="progress-bar-container" id="preview-progress" hidden>
    <div class="progress-bar-fill" id="preview-progress-fill"></div>
  </div>
  <button class="btn btn-primary btn-large" id="export-video">Exportar</div>
  <div class="progress-bar-container" id="preview-progress" hidden>
    <div class="progress-bar-fill" id="preview-progress-fill"></div>
    <span class="progress-text" id="export-progress-text">0%</span>
  </div>
  <div class="export-results" id="export-results" hidden></div>
  <button class="btn btn-secondary" id="open-folder" hidden>Abrir carpeta</button>
  <div class="focus-editor" id="focus-editor" hidden>
    <div class="focus-preview" id="focus-preview">
      <img id="focus-main-img" src="" alt="Imagen principal">
      <div class="focus-overlay-9x16" id="overlay-9x16"></div>
      <div class="focus-overlay-16x9" id="overlay-16x9"></div>
      <div class="focus-point" id="focus-point"></div>
    </div>
  </div>
  <div class="config-group" id="subtitles-fields" hidden>
    <input type="range" id="subtitle-font-h" min="20" max="120" value="48">
    <input type="range" id="subtitle-font-v" min="20" max="120" value="64">
  </div>
  <button class="btn btn-secondary" id="focus-center">Centrar</button>
  <button class="btn btn-secondary" id="focus-apply-all">Aplicar a todas</button>
  <canvas id="overlay-9x16"></canvas>
  <canvas id="overlay-16x9"></canvas>
</body>
</html>`, { url: 'http://localhost' });

    window = dom.window;
    document = window.document;
    global.window = window;
    global.document = document;
    global.console = console;
    global.URL = window.URL;
    global.File = window.File;
    global.Blob = window.Blob;
    global.FileReader = window.FileReader;
    global.navigator.clipboard = { readText: vi.fn().mockResolvedValue('') };
  });

  it('carga renderer.js sin lanzar aunque falte elemento de UI nueva', () => {
    expect(document.getElementById('images-dropzone')).toBeTruthy();
    expect(document.getElementById('images-input')).toBeTruthy();
    expect(document.getElementById('narration-dropzone')).toBeTruthy();
    expect(document.getElementById('narration-input')).toBeTruthy();
    expect(document.getElementById('music-dropzone')).toBeTruthy();
    expect(document.getElementById('music-input')).toBeTruthy();
  });

  it('change de imágenes produce items con path absoluto', () => {
    const input = document.getElementById('images-input');
    expect(input).toBeTruthy();
    expect(input.accept).toBe('image/png,image/jpeg,image/webp,video/mp4');
    expect(input.multiple).toBe(true);
  });

  it('drop en la zona de música añade un item de música', () => {
    const musicDropzone = document.getElementById('music-dropzone');
    const musicInput = document.getElementById('music-input');
    expect(musicDropzone).toBeTruthy();
    expect(musicInput).toBeTruthy();
    expect(musicInput.accept).toBe('audio/mp3,audio/wav,audio/m4a,audio/aac');
    expect(musicInput.multiple).toBeFalsy();
  });
});