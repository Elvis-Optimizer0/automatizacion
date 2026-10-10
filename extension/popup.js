const $ = (id) => document.getElementById(id);

let currentState = null;
let currentTab = null;
let injectionAttempts = 0;
let diagnosticLogs = [];

function formatTime(ms) {
  if (!ms || ms < 0) return 'calculando...';
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  if (mins > 0) return `${mins}m ${secs % 60}s`;
  return `${secs}s`;
}

function addLog(entry) {
  diagnosticLogs.push(entry);
  if (diagnosticLogs.length > 100) diagnosticLogs.shift();
  renderLogs();
  renderDiagnostic();
}

function logInfo(msg) { addLog({ type: 'info', time: Date.now(), msg }); }
function logSuccess(msg) { addLog({ type: 'success', time: Date.now(), msg }); }
function logWarning(msg) { addLog({ type: 'warning', time: Date.now(), msg }); }
function logError(msg) { addLog({ type: 'error', time: Date.now(), msg }); }

function sendMessage(type, data = {}) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type, ...data }, resolve);
  });
}

function sendToContentScript(type, data = {}) {
  if (!currentTab?.id) return Promise.resolve({ error: 'No tab' });
  return new Promise(resolve => {
    chrome.tabs.sendMessage(currentTab.id, { type, ...data }, resolve);
  });
}

async function ensureInjected() {
  if (!currentTab?.id) return { success: false, error: 'No active tab' };

  const blockedProtocols = ['chrome:', 'edge:', 'brave:', 'opera:', 'about:', 'chrome-extension:'];
  if (blockedProtocols.some(p => currentTab.url?.startsWith(p))) {
    return { success: false, error: 'Abre la pestaña de Flow y vuelve a abrir esta ventana' };
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    injectionAttempts = attempt + 1;
    const response = await sendToContentScript('PING');
    if (response?.ok) {
      return { success: true, response };
    }
    if (attempt < 2) {
      logInfo(`PING falló (intento ${attempt + 1}), inyectando content script...`);
      try {
        await chrome.scripting.executeScript({
          target: { tabId: currentTab.id, allFrames: true },
          files: ['selectors.js', 'content.js']
        });
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        logError(`Error inyectando: ${e.message}`);
      }
    }
  }
  return { success: false, error: 'No se pudo conectar con la página tras 3 intentos' };
}

function updateStatusIndicator(response) {
  const indicator = $('#status-indicator');
  const dot = indicator.querySelector('.status-dot');
  const text = indicator.querySelector('.status-text');

  indicator.classList.remove('connected', 'warning', 'error', 'connecting');

  if (!response) {
    indicator.classList.add('error');
    text.textContent = 'Sin conexión';
    return;
  }

  if (response.looksLikeFlow) {
    indicator.classList.add('connected');
    text.textContent = 'Conectado a Flow';
  } else {
    indicator.classList.add('warning');
    text.textContent = 'Conectado, pero esta página no parece Flow (puedes calibrar igual)';
  }
}

function updateSelectorsUI(selectors, selectorMeta) {
  const keys = ['input', 'submit', 'resultImage'];
  const labels = { input: 'Caja de texto', submit: 'Botón generar', resultImage: 'Imagen resultado' };

  keys.forEach(key => {
    const badge = $(`badge-${key}`);
    const meta = $(`meta-${key}`);
    const row = document.querySelector(`.selector-row[data-key="${key}"]`);

    if (selectors[key]) {
      badge.textContent = '✔';
      badge.classList.add('ok');
      row.classList.add('has-selector');
    } else {
      badge.textContent = '✖';
      badge.classList.remove('ok');
      row.classList.remove('has-selector');
    }

    if (selectorMeta[key]) {
      const m = selectorMeta[key];
      meta.textContent = `${m.tag || ''} ${m.ariaLabel ? `aria-label="${m.ariaLabel}"` : ''} ${m.placeholder ? `placeholder="${m.placeholder}"` : ''} ${m.text ? `text="${m.text}"` : ''} ${m.kind ? `kind="${m.kind}"` : ''} @ ${m.frameUrl || 'top'}`.trim();
    } else {
      meta.textContent = 'Sin selector guardado';
    }
  });
}

function renderQueue(queue) {
  const list = $('#queue-list');
  const done = queue.filter(q => q.status === 'done').length;
  const total = queue.length;

  $('#done-count').textContent = done;
  $('#total-count').textContent = total;

  if (queue.length === 0) {
    list.innerHTML = '<div style="color:var(--text-dim);text-align:center;padding:20px;">Cola vacía</div>';
    return;
  }

  list.innerHTML = queue.map(item => {
    const icons = { pending: '⏳', running: '⚙️', done: '✅', error: '❌' };
    const statusClass = item.status;
    const errorAttr = item.error ? ` data-error="${item.error.replace(/"/g, '"')}"` : '';
    return `
      <div class="queue-item">
        <span class="status-icon ${statusClass}">${icons[statusClass] || '⏳'}</span>
        <span class="prompt-text" title="${item.text}">${item.text}</span>
        ${item.status === 'error' ? `<span class="error-tooltip"${errorAttr}>⚠</span>` : ''}
      </div>
    `;
  }).join('');
}

function updateProgress(state) {
  const queue = state.queue;
  const done = queue.filter(q => q.status === 'done').length;
  const running = queue.find(q => q.status === 'running');
  const pending = queue.filter(q => q.status === 'pending').length;
  const total = queue.length;

  const progressInfo = $('#progress-info');
  const progressFill = $('#progress-fill');
  const progressText = $('#progress-text');

  if (total === 0) {
    progressInfo.hidden = true;
    return;
  }

  progressInfo.hidden = false;
  const percent = total > 0 ? (done / total) * 100 : 0;
  progressFill.style.width = `${percent}%`;

  if (state.running && !state.paused && running) {
    const avgTime = calculateAvgTime(queue);
    const remaining = pending * avgTime;
    progressText.textContent = `Tiempo restante estimado: ${formatTime(remaining)}`;
  } else if (state.paused) {
    progressText.textContent = 'Pausado';
  } else if (done === total && total > 0) {
    progressText.textContent = '¡Completado!';
  } else {
    progressText.textContent = 'Listo para iniciar';
  }
}

function calculateAvgTime(queue) {
  const completed = queue.filter(q => q.status === 'done' && q.startedAt && q.finishedAt);
  if (completed.length === 0) return 30000;
  const total = completed.reduce((sum, q) => sum + (q.finishedAt - q.startedAt), 0);
  return total / completed.length;
}

function renderLogs() {
  const container = $('#log-container');
  chrome.storage.local.get('colaPromptsLogs', (data) => {
    const logs = data.colaPromptsLogs || [];
    container.innerHTML = logs.map(entry => {
      const time = entry.substring(0, 8);
      const msg = entry.substring(9);
      let cls = 'info';
      if (msg.startsWith('ERROR')) cls = 'error';
      else if (msg.includes('completado') || msg.includes('guardado')) cls = 'success';
      else if (msg.includes('advertencia') || msg.includes('warning')) cls = 'warning';
      return `<div class="log-entry ${cls}"><span style="color:var(--text-dim)">${time}</span> ${msg}</div>`;
    }).join('');
    container.scrollTop = container.scrollHeight;
  });
}

function renderDiagnostic() {
  const container = $('#diagnostic-content');
  if (!currentState || !currentTab) {
    container.textContent = 'Aún no hay datos de diagnóstico';
    return;
  }

  const { selectors = {}, selectorMeta = {} } = currentState;
  const lines = [
    `Versión: ${chrome.runtime.getManifest().version}`,
    `URL: ${currentTab.url}`,
    `Hostname: ${currentTab.url ? new URL(currentTab.url).hostname : 'N/A'}`,
    `Intentos de inyección: ${injectionAttempts}`,
    '',
    'Selectores guardados:',
    `  input: ${selectors.input ? '✔' : '✖'} ${selectorMeta.input ? selectorMeta.input.selector : ''}`,
    `  submit: ${selectors.submit ? '✔' : '✖'} ${selectorMeta.submit ? selectorMeta.submit.selector : ''}`,
    `  resultImage: ${selectors.resultImage ? '✔' : '✖'} ${selectorMeta.resultImage ? selectorMeta.resultImage.selector : ''}`,
    '',
    'Últimos logs:',
    ...diagnosticLogs.slice(-20).map(l => `  [${new Date(l.time).toLocaleTimeString()}] ${l.msg}`)
  ];
  container.textContent = lines.join('\n');
}

function updateUI(state) {
  currentState = state;

  updateSelectorsUI(state.selectors || {}, state.selectorMeta || {});
  renderQueue(state.queue || []);
  updateProgress(state);
  renderLogs();
  renderDiagnostic();

  const hasSelectors = state.selectors?.input && state.selectors?.submit && state.selectors?.resultImage;
  $('#start-btn').disabled = !hasSelectors || state.running || (state.queue?.length || 0) === 0;
  $('#pause-btn').disabled = !state.running || state.paused;
  $('#stop-btn').disabled = !state.running;

  $('#setting-delay').value = state.settings?.delayBetweenMs || 3000;
  $('#setting-timeout').value = state.settings?.timeoutPerPromptMs || 180000;
  $('#setting-retries').value = state.settings?.maxRetries || 2;
  $('#setting-images').value = state.settings?.imagesPerPrompt || 1;

  $('#extension-version').textContent = `v${chrome.runtime.getManifest().version}`;
}

async function loadState() {
  const response = await sendMessage('GET_STATE');
  if (response?.state) updateUI(response.state);
}

function showNotification(msg, type = 'info') {
  const notif = document.createElement('div');
  notif.className = `notification ${type}`;
  notif.textContent = msg;
  document.body.appendChild(notif);
  setTimeout(() => {
    notif.style.animation = 'slideUp 0.3s ease';
    setTimeout(() => notif.remove(), 300);
  }, 3000);
}

function setupEventListeners() {
  $('#add-prompts').addEventListener('click', async () => {
    const text = $('#prompts-textarea').value.trim();
    if (!text) return;
    const prompts = text.split('\n')
      .map(l => l.replace(/^\s*PROMPT\s*\d+\s*[:.\-]\s*/i, '').trim())
      .filter(l => l.length > 0);
    const uniquePrompts = [...new Set(prompts)];
    const response = await sendMessage('ADD_PROMPTS', { prompts: uniquePrompts });
    if (response?.success) {
      $('#prompts-textarea').value = '';
      logSuccess(`Añadidos ${uniquePrompts.length} prompts`);
      loadState();
    }
  });

  $('#import-prompts').addEventListener('click', () => $('#import-file').click());

  $('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      if (data.queue) {
        await sendMessage('IMPORT_STATE', { json: text });
      } else {
        const prompts = text.split('\n').map(l => l.trim()).filter(l => l);
        await sendMessage('ADD_PROMPTS', { prompts });
      }
      logSuccess('Importado correctamente');
      loadState();
    } catch {
      const prompts = text.split('\n').map(l => l.trim()).filter(l => l);
      await sendMessage('ADD_PROMPTS', { prompts });
      logSuccess('Importado como prompts');
      loadState();
    }
    e.target.value = '';
  });

  $('#export-state').addEventListener('click', async () => {
    const response = await sendMessage('EXPORT_STATE');
    if (response?.state) {
      const blob = new Blob([response.state], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cola-prompts-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      logSuccess('Estado exportado');
    }
  });

  $('#calibrate-btn').addEventListener('click', async () => {
    const result = await ensureInjected();
    if (!result.success) {
      logError(result.error);
      showNotification(result.error, 'error');
      return;
    }
    await sendToContentScript('CALIBRATE_START');
    logInfo('Calibración iniciada');
    window.close();
  });

  $('#autodetect-btn').addEventListener('click', async () => {
    const result = await ensureInjected();
    if (!result.success) {
      showNotification(result.error, 'error');
      return;
    }
    const response = await sendToContentScript('AUTODETECT');
    if (response?.success) {
      logInfo('Autodetectar ejecutado');
      if (response.results.input) {
        await sendMessage('SAVE_SELECTORS', { selectors: { input: response.results.input.selector } });
      }
      if (response.results.submit) {
        await sendMessage('SAVE_SELECTORS', { selectors: { submit: response.results.submit.selector } });
      }
      if (response.results.resultImage) {
        await sendMessage('SAVE_SELECTORS', { selectors: { resultImage: response.results.resultImage.selector } });
      }
      loadState();
    }
  });

  document.querySelectorAll('[data-action="test"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.key;
      const selector = currentState?.selectors?.[key];
      if (!selector) {
        showNotification('No hay selector guardado para probar', 'error');
        return;
      }
      const result = await ensureInjected();
      if (!result.success) {
        showNotification(result.error, 'error');
        return;
      }
      await sendToContentScript('TEST_SELECTOR', { selector, type: key });
      logInfo(`Probando selector: ${key}`);
      showNotification(`Probando ${key}...`, 'info');
    });
  });

  $('#start-btn').addEventListener('click', async () => {
    const result = await ensureInjected();
    if (!result.success) {
      showNotification(result.error, 'error');
      return;
    }
    if (!currentState?.selectors?.input || !currentState?.selectors?.submit || !currentState?.selectors?.resultImage) {
      showNotification('Primero calibra (o usa Autodetectar)', 'error');
      return;
    }
    await sendMessage('START_QUEUE');
    logInfo('Cola iniciada');
    loadState();
  });

  $('#pause-btn').addEventListener('click', async () => {
    await sendMessage('PAUSE_QUEUE');
    logInfo('Cola pausada');
    loadState();
  });

  $('#stop-btn').addEventListener('click', async () => {
    await sendMessage('STOP_QUEUE');
    logInfo('Cola detenida');
    loadState();
  });

  $('#clear-btn').addEventListener('click', async () => {
    if (!confirm('¿Limpiar toda la cola?')) return;
    await sendMessage('CLEAR_QUEUE');
    logInfo('Cola limpiada');
    loadState();
  });

  $('#retry-btn').addEventListener('click', async () => {
    await sendMessage('RETRY_ERRORS');
    logInfo('Reintentando errores');
    loadState();
  });

  ['setting-delay', 'setting-timeout', 'setting-retries', 'setting-images'].forEach(id => {
    $(id).addEventListener('change', async () => {
      const settings = {
        delayBetweenMs: parseInt($('#setting-delay').value, 10),
        timeoutPerPromptMs: parseInt($('#setting-timeout').value, 10),
        maxRetries: parseInt($('#setting-retries').value, 10),
        imagesPerPrompt: parseInt($('#setting-images').value, 10)
      };
      await sendMessage('UPDATE_SETTINGS', { settings });
    });
  });

  $('#copy-diagnostic').addEventListener('click', async () => {
    const fullDiagnostic = {
      version: chrome.runtime.getManifest().version,
      timestamp: new Date().toISOString(),
      tab: currentTab ? { url: currentTab.url, title: currentTab.title } : null,
      injectionAttempts,
      state: currentState,
      logs: diagnosticLogs
    };
    const json = JSON.stringify(fullDiagnostic, null, 2);
    await navigator.clipboard.writeText(json);
    showNotification('Diagnóstico copiado al portapapeles', 'success');
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'STATE_UPDATE') {
    updateUI(message.state);
  } else if (message.type === 'QUEUE_COMPLETE') {
    loadState();
    showNotification('Cola completada', 'success');
  }
});

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  if (!tab?.url || ['chrome:', 'edge:', 'brave:', 'opera:', 'about:', 'chrome-extension:'].some(p => tab.url.startsWith(p))) {
    $('#status-indicator').classList.add('error');
    $('#status-indicator .status-text').textContent = 'Abre la pestaña de Flow y vuelve a abrir esta ventana';
    $('#calibrate-btn').disabled = true;
    $('#autodetect-btn').disabled = true;
    $('#start-btn').disabled = true;
    logWarning('Pestaña no válida para Flow');
  } else {
    logInfo(`Conectando a ${tab.url}...`);
    const result = await ensureInjected();
    if (result.success && result.response) {
      updateStatusIndicator(result.response);
      logSuccess('Conectado al content script');
    } else {
      $('#status-indicator').classList.add('error');
      $('#status-indicator .status-text').textContent = `No se pudo conectar: ${result.error}`;
      logError(result.error);
    }
  }

  loadState();
  setupEventListeners();

  setInterval(loadState, 2000);
  setInterval(renderLogs, 3000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

const style = document.createElement('style');
style.textContent = `
  @keyframes slideUp {
    from { opacity: 1; transform: translateX(-50%) translateY(0); }
    to { opacity: 0; transform: translateX(-50%) translateY(-10px); }
  }
`;
document.head.appendChild(style);