// Utility functions (inlined for renderer process)
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs.toFixed(1)}s`;
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function debounce(fn, ms) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

async function makeEntry(file) {
  let p = await window.api.getRealPath(file);
  if (!p) p = await window.api.stageFile(file.name, await file.arrayBuffer());
  console.log('[makeEntry]', file.name, 'path=', JSON.stringify(p));
  if (!p || !/^([a-zA-Z]:[\\/]|\\\\)/.test(p)) throw new Error('No se obtuvo ruta absoluta para ' + file.name);
  return { name: file.name, path: p, blobUrl: URL.createObjectURL(file), size: file.size, type: file.type };
}

let state = {
  images: [],
  narration: null,
  music: null,
  script: '',
  config: {
    resolution: '9:16',
    fps: 30,
    imageFit: 'cover',
    fitTimesToAudio: true,
    zoom: {
      enabled: true,
      initialScale: 1.22,
      intensity: 0.10,
      mode: 'fixed',
      styles: ['kenburns']
    },
    transition: {
      mode: 'fixed',
      types: ['slidedown'],
      duration: 0.5
    },
    badges: [],
    lowerThird: {
      enabled: false,
      text: '@usuario',
      opacity: 0.55
    },
    progressBar: {
      enabled: true,
      heightPx: 8,
      color: '#FF0000'
    }
  },
  sceneDurationOverrides: {},
  timeline: null,
  previewPath: null
};

let previewAbortController = null;

function $(selector) {
  return document.querySelector(selector);
}

function $$(selector) {
  return document.querySelectorAll(selector);
}

function showToast(message, type = 'error') {
  const toast = $(`#${type}-toast`);
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 5000);
}

function setupDropZone(dropzoneId, inputId, onFiles, options = {}) {
  const dropzone = $(`#${dropzoneId}`);
  const input = $(`#${inputId}`);
  const content = dropzone.querySelector('.drop-zone-content');
  const preview = dropzone.querySelector('.drop-zone-preview');
  const fileInfo = dropzone.querySelector('.file-info');

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
    dropzone.addEventListener(evt, e => {
      e.preventDefault();
      e.stopPropagation();
    });
  });

  ['dragenter', 'dragover'].forEach(evt => {
    dropzone.addEventListener(evt, () => dropzone.classList.add('drag-over'));
  });

  ['dragleave', 'drop'].forEach(evt => {
    dropzone.addEventListener(evt, () => dropzone.classList.remove('drag-over'));
  });

  dropzone.addEventListener('drop', e => {
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) onFiles(files);
  });

  dropzone.addEventListener('click', () => input.click());

  input.addEventListener('change', e => {
    const files = Array.from(e.target.files);
    if (files.length > 0) onFiles(files);
    e.target.value = '';
  });
}

function updateImagesUI() {
  const dropzone = $('#images-dropzone');
  const content = $('#images-drop-content');
  const preview = $('#images-preview');
  const grid = $('#images-grid');
  const status = $('#images-status');

  if (state.images.length === 0) {
    content.hidden = false;
    preview.hidden = true;
    status.textContent = 'Sin archivos';
    return;
  }

  content.hidden = true;
  preview.hidden = false;
  status.textContent = `${state.images.length} imágenes · ${formatFileSize(state.images.reduce((sum, img) => sum + (img.size || 0), 0))}`;

  grid.innerHTML = state.images.map((img, index) => `
    <div class="preview-item" data-index="${index}">
      <span class="item-number">${index + 1}</span>
      ${img.type === 'video'
        ? `<video src="${img.blobUrl}" muted></video>`
        : `<img src="${img.blobUrl}" alt="Escena ${index + 1}">`
      }
      <button class="remove-btn" data-index="${index}" title="Quitar">✕</button>
    </div>
  `).join('');

  $$('#images-grid .remove-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const index = parseInt(e.currentTarget.dataset.index, 10);
      state.images.splice(index, 1);
      updateImagesUI();
      updateTimelineButton();
    });
  });

  new Sortable(grid, {
    animation: 150,
    onEnd: evt => {
      const [moved] = state.images.splice(evt.oldIndex, 1);
      state.images.splice(evt.newIndex, 0, moved);
      updateImagesUI();
      updateTimelineButton();
    }
  });
}

function updateTimelineButton() {
  const btn = $('#build-timeline');
  const hasImages = state.images.length > 0;
  const hasNarration = state.narration !== null;
  btn.disabled = !(hasImages && hasNarration);
}

function setupImages() {
  setupDropZone('images-dropzone', 'images-input', async files => {
    const validFiles = files.filter(f => /\.(png|jpe?g|webp|mp4)$/i.test(f.name));
    if (validFiles.length !== files.length) {
      showToast('Solo se permiten PNG, JPG, WEBP y MP4');
    }
    const newImages = [];
    for (const f of validFiles) {
      try {
        const entry = await makeEntry(f);
        newImages.push(entry);
      } catch (e) {
        showToast(`Error al procesar ${f.name}: ${e.message}`);
      }
    }
    state.images = [...state.images, ...newImages];
    updateImagesUI();
    updateTimelineButton();
  });

  $('#clear-images').addEventListener('click', () => {
    state.images = [];
    updateImagesUI();
    updateTimelineButton();
  });
}

function setupAudio() {
  setupDropZone('narration-dropzone', 'narration-input', async files => {
    const file = files[0];
    if (!/\.(mp3|wav|m4a|aac)$/i.test(file.name)) {
      showToast('Formato de audio no válido');
      return;
    }
    try {
      const entry = await makeEntry(file);
      state.narration = { name: entry.name, path: entry.path, blobUrl: entry.blobUrl, size: entry.size };
      updateNarrationUI();
      updateTimelineButton();
    } catch (e) {
      showToast(`Error al procesar narración: ${e.message}`);
    }
  });

  setupDropZone('music-dropzone', 'music-input', async files => {
    const file = files[0];
    if (!/\.(mp3|wav|m4a|aac)$/i.test(file.name)) {
      showToast('Formato de audio no válido');
      return;
    }
    try {
      const entry = await makeEntry(file);
      state.music = { name: entry.name, path: entry.path, blobUrl: entry.blobUrl, size: entry.size, volume: 0.12 };
      updateMusicUI();
    } catch (e) {
      showToast(`Error al procesar música: ${e.message}`);
    }
  });

  $('#clear-narration').addEventListener('click', e => {
    e.stopPropagation();
    state.narration = null;
    updateNarrationUI();
    updateTimelineButton();
  });

  $('#clear-music').addEventListener('click', e => {
    e.stopPropagation();
    state.music = null;
    updateMusicUI();
  });

  $('#music-volume').addEventListener('input', e => {
    const val = parseInt(e.target.value, 10);
    $('#music-volume-value').textContent = `${val}%`;
    if (state.music) state.music.volume = val / 100;
  });
}

function updateNarrationUI() {
  const content = $('#narration-drop-content');
  const info = $('#narration-info');
  const nameEl = $('#narration-name');
  const durationEl = $('#narration-duration');

  if (state.narration) {
    content.hidden = true;
    info.hidden = false;
    nameEl.textContent = state.narration.name;
    getAudioDuration(state.narration).then(d => {
      durationEl.textContent = formatDuration(d);
    }).catch(() => {
      durationEl.textContent = '?';
    });
  } else {
    content.hidden = false;
    info.hidden = true;
  }
}

function updateMusicUI() {
  const content = $('#music-drop-content');
  const info = $('#music-info');
  const volumeControl = $('#music-volume-control');
  const nameEl = $('#music-name');
  const durationEl = $('#music-duration');

  if (state.music) {
    content.hidden = true;
    info.hidden = false;
    volumeControl.hidden = false;
    nameEl.textContent = state.music.name;
    $('#music-volume').value = Math.round(state.music.volume * 100);
    $('#music-volume-value').textContent = `${Math.round(state.music.volume * 100)}%`;
    getAudioDuration(state.music).then(d => {
      durationEl.textContent = formatDuration(d);
    }).catch(() => {
      durationEl.textContent = '?';
    });
  } else {
    content.hidden = false;
    info.hidden = true;
    volumeControl.hidden = true;
  }
}

async function getAudioDuration(item) {
  const result = await window.api.getAudioDuration(item.path);
  if (!result.success) throw new Error(result.error);
  return result.duration;
}

function setupScript() {
  const textarea = $('#script-textarea');
  const status = $('#script-status');
  const fitTimes = $('#fit-times');

  textarea.addEventListener('input', debounce(() => {
    state.script = textarea.value;
    state.config.fitTimesToAudio = fitTimes.checked;
    updateScriptStatus();
  }, 300));

  fitTimes.addEventListener('change', () => {
    state.config.fitTimesToAudio = fitTimes.checked;
  });

  $('#paste-script').addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      textarea.value = text;
      state.script = text;
      updateScriptStatus();
    } catch {
      showToast('No se pudo acceder al portapapeles');
    }
  });

  $('#load-script').addEventListener('click', () => {
    $('#script-file-input').click();
  });

  $('#script-file-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      textarea.value = ev.target.result;
      state.script = ev.target.result;
      updateScriptStatus();
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  function updateScriptStatus() {
    const segments = state.script.trim().split('\n').filter(l => l.trim()).length;
    const hasTimestamps = /\(\d{1,2}:\d{2}\)/.test(state.script);
    status.textContent = `${segments} ${hasTimestamps ? 'segmentos con timestamps' : 'líneas'} detectad${segments === 1 ? 'o' : 'as'}`;
  }
}

function setupConfig() {
  const defaultConfig = {
    resolution: '9:16',
    fps: 30,
    imageFit: 'cover',
    fitTimesToAudio: true,
    zoom: { enabled: true, initialScale: 1.22, intensity: 0.10, mode: 'fixed', styles: ['kenburns'] },
    transition: { mode: 'fixed', types: ['slidedown'], duration: 0.5 },
    badges: [],
    lowerThird: { enabled: false, text: '@usuario', opacity: 0.55 },
    progressBar: { enabled: true, heightPx: 8, color: '#FF0000' }
  };

  state.config = { ...defaultConfig };

  $$('#resolution-segmented .segment').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('#resolution-segmented .segment').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.config.resolution = btn.dataset.value;
    });
  });

  $('#zoom-enabled').addEventListener('change', e => {
    state.config.zoom.enabled = e.target.checked;
  });

  $('#zoom-scale').addEventListener('input', e => {
    const val = parseInt(e.target.value, 10);
    $('#zoom-scale-value').textContent = `${val}%`;
    state.config.zoom.initialScale = val / 100;
  });

  $('#zoom-intensity').addEventListener('input', e => {
    const val = parseInt(e.target.value, 10);
    $('#zoom-intensity-value').textContent = `${val}%`;
    state.config.zoom.intensity = val / 100;
  });

  $$('#zoom-mode-segmented .segment').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('#zoom-mode-segmented .segment').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.config.zoom.mode = btn.dataset.value;
    });
  });

  $$('#zoom-styles-chips .chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const value = btn.dataset.value;
      if (btn.classList.contains('active')) {
        if ($$('#zoom-styles-chips .chip.active').length > 1) {
          btn.classList.remove('active');
          state.config.zoom.styles = state.config.zoom.styles.filter(s => s !== value);
        }
      } else {
        btn.classList.add('active');
        if (!state.config.zoom.styles.includes(value)) {
          state.config.zoom.styles.push(value);
        }
      }
    });
  });

  $$('#transition-mode-segmented .segment').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('#transition-mode-segmented .segment').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.config.transition.mode = btn.dataset.value;
    });
  });

  $$('#transition-chips .chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const value = btn.dataset.value;
      if (btn.classList.contains('active')) {
        if ($$('#transition-chips .chip.active').length > 1) {
          btn.classList.remove('active');
          state.config.transition.types = state.config.transition.types.filter(s => s !== value);
        }
      } else {
        btn.classList.add('active');
        if (!state.config.transition.types.includes(value)) {
          state.config.transition.types.push(value);
        }
      }
    });
  });

  $('#transition-duration').addEventListener('input', e => {
    const val = parseFloat(e.target.value);
    $('#transition-duration-value').textContent = `${val.toFixed(1)}s`;
    state.config.transition.duration = val;
  });
}

function setupExtras() {
  $('#lower-third-enabled').addEventListener('change', e => {
    state.config.lowerThird.enabled = e.target.checked;
    $('#lower-third-fields').hidden = !e.target.checked;
    $('#lower-third-opacity-group').hidden = !e.target.checked;
  });

  $('#lower-third-text').addEventListener('input', e => {
    state.config.lowerThird.text = e.target.value;
  });

  $('#lower-third-opacity').addEventListener('input', e => {
    const val = parseInt(e.target.value, 10);
    $('#lower-third-opacity-value').textContent = `${val}%`;
    state.config.lowerThird.opacity = val / 100;
  });

  $('#progress-bar-enabled').addEventListener('change', e => {
    state.config.progressBar.enabled = e.target.checked;
    $('#progress-bar-fields').hidden = !e.target.checked;
  });

  $('#progress-bar-color').addEventListener('input', e => {
    state.config.progressBar.color = e.target.value;
  });

  $('#progress-bar-height').addEventListener('input', e => {
    const val = parseInt(e.target.value, 10);
    $('#progress-bar-height-value').textContent = `${val}px`;
    state.config.progressBar.heightPx = val;
  });

  setupDropZone('badges-dropzone', 'badges-input', files => {
    const validFiles = files.filter(f => f.type === 'image/png');
    if (validFiles.length !== files.length) {
      showToast('Solo se permiten archivos PNG');
    }
    state.config.badges = validFiles.map(f => ({
      file: f,
      name: f.name,
      at: 0,
      duration: 3,
      sizePercent: 15,
      position: 'top-right',
      animation: 'pop'
    }));
    updateBadgesUI();
  });

  $('#clear-badges').addEventListener('click', () => {
    state.config.badges = [];
    updateBadgesUI();
  });

  function updateBadgesUI() {
    const info = $('#badges-info');
    const count = $('#badges-count');
    const list = $('#badges-list');
    const addBtn = $('#add-badge');

    if (state.config.badges.length === 0) {
      info.hidden = true;
      list.innerHTML = '';
      addBtn.hidden = true;
      return;
    }

    info.hidden = false;
    count.textContent = `${state.config.badges.length} botón${state.config.badges.length > 1 ? 'es' : ''}`;
    addBtn.hidden = false;

    list.innerHTML = state.config.badges.map((badge, index) => `
      <div class="badge-config" data-index="${index}">
        <label>
          Segundo de aparición
          <input type="number" step="0.1" min="0" value="${badge.at}" data-field="at">
        </label>
        <label>
          Duración (s)
          <input type="number" step="0.1" min="0.1" value="${badge.duration}" data-field="duration">
        </label>
        <label>
          Tamaño (%)
          <input type="number" min="1" max="100" value="${badge.sizePercent}" data-field="sizePercent">
        </label>
        <div class="position-grid" data-field="position">
          ${['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right'].map(pos => `
            <button class="position-btn ${badge.position === pos ? 'active' : ''}" data-pos="${pos}" title="${pos}">
              ${getPositionIcon(pos)}
            </button>
          `).join('')}
        </div>
        <button class="btn-icon" data-action="remove" title="Quitar">✕</button>
      </div>
    `).join('');

    list.querySelectorAll('.badge-config').forEach(el => {
      const index = parseInt(el.dataset.index, 10);
      el.querySelectorAll('input[data-field]').forEach(input => {
        input.addEventListener('change', () => {
          const field = input.dataset.field;
          const value = input.type === 'number' ? parseFloat(input.value) : input.value;
          state.config.badges[index][field] = value;
        });
      });
      el.querySelectorAll('.position-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          el.querySelectorAll('.position-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          state.config.badges[index].position = btn.dataset.pos;
        });
      });
      el.querySelector('[data-action="remove"]').addEventListener('click', () => {
        state.config.badges.splice(index, 1);
        updateBadgesUI();
      });
    });
  }

  function getPositionIcon(pos) {
    const icons = {
      'top-left': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="2"/></svg>',
      'top-right': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="16" cy="8" r="2"/></svg>',
      'center': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="2"/></svg>',
      'bottom-left': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="16" r="2"/></svg>',
      'bottom-right': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="16" cy="16" r="2"/></svg>'
    };
    return icons[pos];
  }
}

async function buildTimeline() {
  if (state.images.length === 0) {
    showToast('Sube al menos una imagen');
    return;
  }
  if (!state.narration) {
    showToast('Falta el audio de narración');
    return;
  }

  const btn = $('#build-timeline');
  btn.disabled = true;
  btn.textContent = 'Generando...';

  const project = buildProject();

  const result = await window.api.buildTimeline(project);

  btn.disabled = false;
  btn.textContent = 'Generar línea de tiempo';

  if (!result.success) {
    showToast(result.error);
    return;
  }

  state.timeline = result.timeline;
  renderTimeline(result.timeline);
  $('#timeline-container').hidden = false;
  showToast('Línea de tiempo generada', 'success');
}

function renderTimeline(timeline) {
  const factorEl = $('#timeline-factor');
  const body = $('#timeline-body');

  if (timeline.fitApplied) {
    const scriptDuration = Math.round(timeline.estEnd);
    const audioDuration = Math.round(timeline.audioDuration);
    factorEl.textContent = `Ajuste de tiempos: ×${timeline.factor.toFixed(2)} · guion ${formatTime(scriptDuration)} → audio ${formatTime(audioDuration)}`;
  } else {
    factorEl.textContent = '';
  }

  body.innerHTML = timeline.scenes.map((scene, index) => `
    <tr data-index="${index}">
      <td>${index + 1}</td>
      <td><img class="thumb" src="${scene.blobUrl || scene.file}" alt="Escena ${index + 1}"></td>
      <td>${formatTime(scene.start)}</td>
      <td>${formatTime(scene.end)}</td>
      <td>
        <div class="duration-input">
          <button data-action="dec" data-index="${index}">−</button>
          <input type="number" step="0.1" min="0.1" value="${scene.duration.toFixed(1)}" data-index="${index}" data-field="duration">
          <button data-action="inc" data-index="${index}">+</button>
        </div>
      </td>
      <td>${scene.zoomStyle}</td>
      <td>${scene.transitionType}</td>
    </tr>
  `).join('');

  body.querySelectorAll('.duration-input button').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt(btn.dataset.index, 10);
      const input = body.querySelector(`input[data-index="${index}"]`);
      const step = 0.1;
      let val = parseFloat(input.value);
      if (btn.dataset.action === 'inc') val += step;
      else val = Math.max(0.1, val - step);
      input.value = val.toFixed(1);
      state.sceneDurationOverrides[index.toString()] = val;
    });
  });

  body.querySelectorAll('.duration-input input').forEach(input => {
    input.addEventListener('change', () => {
      const index = parseInt(input.dataset.index, 10);
      const val = parseFloat(input.value);
      if (!isNaN(val) && val > 0) {
        state.sceneDurationOverrides[index.toString()] = val;
      }
    });
  });
}

async function renderPreview() {
  if (!state.timeline) return;

  const btn = $('#render-preview');
  btn.disabled = true;
  btn.textContent = 'Generando...';
  $('#preview-progress').hidden = false;
  $('#preview-progress-fill').style.width = '0%';

  const project = buildProject();
  const fontPath = await getFontPath();

  try {
    const tempPath = await window.api.saveFileDialog({
      filters: [{ name: 'Video MP4', extensions: ['mp4'] }],
      defaultPath: 'preview.mp4',
      title: 'Guardar vista previa'
    });

    if (!tempPath) {
      btn.disabled = false;
      btn.textContent = 'Generar vista previa';
      $('#preview-progress').hidden = true;
      return;
    }

    const cleanup = window.api.onPreviewProgress(data => {
      $('#preview-progress-fill').style.width = `${data.progress}%`;
    });

    const result = await window.api.renderPreview(project, state.timeline, fontPath, tempPath);

    cleanup();
    btn.disabled = false;
    btn.textContent = 'Generar vista previa';
    $('#preview-progress').hidden = true;

    if (result.success) {
      state.previewPath = result.outputPath;
      $('#preview-video').src = result.outputPath;
      $('#preview-section').hidden = false;
      showToast('Vista previa generada', 'success');
    } else {
      showToast(result.error);
    }
  } catch (err) {
    cleanup();
    btn.disabled = false;
    btn.textContent = 'Generar vista previa';
    $('#preview-progress').hidden = true;
    showToast(err.message);
  }
}

async function exportVideo() {
  if (!state.timeline) return;

  const btn = $('#export-video');
  const progressContainer = $('#export-progress');
  const progressFill = $('#export-progress-fill');
  const progressText = $('#export-progress-text');
  const openFolderBtn = $('#open-folder');

  btn.disabled = true;
  btn.textContent = 'Exportando...';
  progressContainer.hidden = false;
  progressFill.style.width = '0%';
  progressText.textContent = '0%';
  openFolderBtn.hidden = true;

  const project = buildProject();
  const fontPath = await getFontPath();

  const outputPath = await window.api.saveFileDialog({
    filters: [{ name: 'Video MP4', extensions: ['mp4'] }],
    defaultPath: 'video.mp4',
    title: 'Exportar video final'
  });

  if (!outputPath) {
    btn.disabled = false;
    btn.textContent = 'Exportar MP4';
    progressContainer.hidden = true;
    return;
  }

  const cleanup = window.api.onRenderProgress(data => {
    progressFill.style.width = `${data.progress.toFixed(1)}%`;
    progressText.textContent = `${data.progress.toFixed(1)}% (${formatTime(data.current)} / ${formatTime(data.total)})`;
  });

  try {
    const result = await window.api.renderVideo(project, state.timeline, fontPath, outputPath);

    cleanup();
    btn.disabled = false;
    btn.textContent = 'Exportar MP4';
    progressContainer.hidden = true;

if (result.success) {
        progressFill.style.width = '100%';
        progressText.textContent = '100% - Completado';
        openFolderBtn.hidden = false;
        openFolderBtn.onclick = () => window.api.openFolder(outputPath.substring(0, outputPath.lastIndexOf('\\') > outputPath.lastIndexOf('/') ? outputPath.lastIndexOf('\\') : outputPath.lastIndexOf('/')));
        showToast('Video exportado correctamente', 'success');
      } else {
      showToast(result.error);
    }
  } catch (err) {
    cleanup();
    btn.disabled = false;
    btn.textContent = 'Exportar MP4';
    progressContainer.hidden = true;
    showToast(err.message);
  }
}

function buildProject() {
  const project = {
    images: state.images.map(img => ({
      file: img.name,
      path: img.path,
      focus: img.focus || { x: 0.5, y: 0.5 }
    })),
    narration: state.narration ? {
      file: state.narration.name,
      path: state.narration.path
    } : undefined,
    music: state.music ? {
      file: state.music.name,
      path: state.music.path,
      volume: state.music.volume
    } : undefined,
    script: state.script,
    config: state.config,
    sceneDurationOverrides: state.sceneDurationOverrides
  };
  console.log('[buildProject] images[0]=', JSON.stringify(project.images?.[0]), 'narration=', JSON.stringify(project.narration));
  return project;
}

function getFontPath() {
  return window.api.getFontPath ? window.api.getFontPath() : Promise.resolve('');
}

async function init() {
  setupImages();
  setupAudio();
  setupScript();
  setupConfig();
  setupExtras();

  $('#build-timeline').addEventListener('click', buildTimeline);
  $('#render-preview').addEventListener('click', renderPreview);
  $('#export-video').addEventListener('click', exportVideo);

  window.api.getDefaultConfig().then(config => {
    state.config = { ...state.config, ...config };
  });

  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(style);
}

if (typeof Sortable === 'undefined') {
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js';
  script.onload = init;
  document.head.appendChild(script);
} else {
  init();
}