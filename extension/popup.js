let currentState = null;
let updateInterval = null;

const $ = (id) => document.getElementById(id);

function formatTime(ms) {
  if (ms < 0) return 'calculando...';
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  if (mins > 0) return `${mins}m ${secs % 60}s`;
  return `${secs}s`;
}

function updateUI(state) {
  currentState = state;

  const hasSelectors = state.selectors.input && state.selectors.submit && state.selectors.resultImage;
  $('calibration-hint').textContent = hasSelectors ? 'Selectores calibrados ✓' : 'Primero calibra los selectores en la página de Flow';
  $('calibration-hint').style.color = hasSelectors ? '#22c55e' : '#8b93a7';
  $('start-btn').disabled = !hasSelectors || state.running || state.queue.length === 0;
  $('pause-btn').disabled = !state.running || state.paused;
  $('stop-btn').disabled = !state.running;

  $('flow-status').textContent = hasSelectors ? 'Flow detectado ✓' : 'Flow no detectado';
  $('flow-status').classList.toggle('connected', hasSelectors);

  renderQueue(state.queue);
  updateProgress(state);
  updateSettingsInputs(state.settings);
}

function renderQueue(queue) {
  const list = $('queue-list');
  const done = queue.filter(q => q.status === 'done').length;
  const total = queue.length;

  $('done-count').textContent = done;
  $('total-count').textContent = total;

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

  const progressInfo = $('progress-info');
  const progressFill = $('progress-fill');
  const progressText = $('progress-text');

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

function updateSettingsInputs(settings) {
  $('setting-delay').value = settings.delayBetweenMs;
  $('setting-timeout').value = settings.timeoutPerPromptMs;
  $('setting-retries').value = settings.maxRetries;
  $('setting-images').value = settings.imagesPerPrompt;
}

async function sendMessage(type, data = {}) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type, ...data }, resolve);
  });
}

async function loadState() {
  const response = await sendMessage('GET_STATE');
  if (response?.state) updateUI(response.state);
}

function setupEventListeners() {
  $('add-prompts').addEventListener('click', async () => {
    const text = $('prompts-textarea').value.trim();
    if (!text) return;
    const prompts = text.split('\n')
      .map(l => l.replace(/^\s*PROMPT\s*\d+\s*[:.\-]\s*/i, '').trim())
      .filter(l => l.length > 0);
    const uniquePrompts = [...new Set(prompts)];
    const response = await sendMessage('ADD_PROMPTS', { prompts: uniquePrompts });
    if (response?.success) {
      $('prompts-textarea').value = '';
      loadState();
    }
  });

  $('import-prompts').addEventListener('click', () => $('import-file').click());

  $('import-file').addEventListener('change', async (e) => {
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
      loadState();
    } catch {
      const prompts = text.split('\n').map(l => l.trim()).filter(l => l);
      await sendMessage('ADD_PROMPTS', { prompts });
      loadState();
    }
    e.target.value = '';
  });

  $('export-state').addEventListener('click', async () => {
    const response = await sendMessage('EXPORT_STATE');
    if (response?.state) {
      const blob = new Blob([response.state], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cola-prompts-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  });

  $('calibrate-btn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'CALIBRATE_START' });
      window.close();
    }
  });

  $('start-btn').addEventListener('click', async () => {
    await sendMessage('START_QUEUE');
    loadState();
  });

  $('pause-btn').addEventListener('click', async () => {
    await sendMessage('PAUSE_QUEUE');
    loadState();
  });

  $('stop-btn').addEventListener('click', async () => {
    await sendMessage('STOP_QUEUE');
    loadState();
  });

  $('clear-btn').addEventListener('click', async () => {
    if (!confirm('¿Limpiar toda la cola?')) return;
    await sendMessage('CLEAR_QUEUE');
    loadState();
  });

  $('retry-btn').addEventListener('click', async () => {
    await sendMessage('RETRY_ERRORS');
    loadState();
  });

  ['setting-delay', 'setting-timeout', 'setting-retries', 'setting-images'].forEach(id => {
    $(id).addEventListener('change', async () => {
      const settings = {
        delayBetweenMs: parseInt($('setting-delay').value, 10),
        timeoutPerPromptMs: parseInt($('setting-timeout').value, 10),
        maxRetries: parseInt($('setting-retries').value, 10),
        imagesPerPrompt: parseInt($('setting-images').value, 10)
      };
      await sendMessage('UPDATE_SETTINGS', { settings });
    });
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'STATE_UPDATE') {
    updateUI(message.state);
  } else if (message.type === 'QUEUE_COMPLETE') {
    loadState();
    showNotification('Cola completada');
  }
});

function showNotification(text) {
  const notif = document.createElement('div');
  notif.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);background:var(--success);color:white;padding:10px 20px;border-radius:6px;font-size:0.85rem;z-index:10000;animation:slideDown 0.3s ease;';
  notif.textContent = text;
  document.body.appendChild(notif);
  setTimeout(() => { notif.style.animation = 'slideUp 0.3s ease'; setTimeout(() => notif.remove(), 300); }, 3000);
}

const style = document.createElement('style');
style.textContent = `
  @keyframes slideDown { from { opacity: 0; transform: translateX(-50%) translateY(-10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
  @keyframes slideUp { from { opacity: 1; transform: translateX(-50%) translateY(0); } to { opacity: 0; transform: translateX(-50%) translateY(-10px); } }
`;
document.head.appendChild(style);

loadState();
setupEventListeners();

updateInterval = setInterval(loadState, 2000);
window.addEventListener('unload', () => clearInterval(updateInterval));