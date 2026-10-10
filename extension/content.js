(function () {
  if (window.__colaPromptsContent) return;
  if (!window.__colaPromptsDetect) {
    console.warn('[ColaPrompts] detect.js no cargado');
    return;
  }

  const detect = window.__colaPromptsDetect;
  const STORAGE_KEY = 'colaPromptsState';
  const LOG_KEY = 'colaPromptsLogs';
  const MAX_LOGS = 50;

  let loopRunning = false;
  let currentFrameId = null;
  let targets = { input: null, submit: null };
  let isResolving = false;

  function log(msg) {
    const time = new Date().toLocaleTimeString('es-ES', { hour12: false });
    chrome.storage.local.get(LOG_KEY, (data) => {
      const logs = (data[LOG_KEY] || []).slice(-MAX_LOGS + 1);
      logs.push(`${time} ${msg}`);
      chrome.storage.local.set({ [LOG_KEY]: logs });
    });
  }

  function logError(code, msg) { log(`ERROR [${code}]: ${msg}`); }

  function getState() {
    return new Promise(resolve => chrome.storage.local.get(STORAGE_KEY, d => resolve({ ...defaultState(), ...d[STORAGE_KEY] })));
  }

  function saveState(state) {
    return new Promise(resolve => chrome.storage.local.set({ [STORAGE_KEY]: state }, resolve));
  }

  function defaultState() {
    return {
      queue: [],
      running: false,
      paused: false,
      settings: { delayBetweenMs: 3000, timeoutPerPromptMs: 180000, maxRetries: 2, imagesPerPrompt: 1, submitMethod: 'auto' },
      siteProfiles: {},
      logs: []
    };
  }

  function resolveTargets() {
    if (isResolving) return Promise.resolve(targets);
    isResolving = true;

    if (targets.input && targets.input.isConnected && detect.isVisible(targets.input) &&
        (!targets.submit || targets.submit.isConnected && detect.isVisible(targets.submit))) {
      isResolving = false;
      return Promise.resolve(targets);
    }

    return new Promise(async resolve => {
      const inputs = detect.findInputs();
      if (inputs.length === 0) {
        isResolving = false;
        throw new Error('INPUT_NOT_FOUND');
      }
      const inputEl = inputs[0].el;
      const submitResult = detect.findSubmit(inputEl);
      targets = { input: inputEl, submit: submitResult.best?.el || null };
      isResolving = false;
      resolve(targets);
    });
  }

  async function processOne(item, state) {
    await resolveTargets();
    const { input, submit } = targets;
    const beforeMap = detect.snapshotMedia();
    log(`Procesando: ${item.text.slice(0, 50)}...`);

    await detect.setPromptText(input, item.text);
    await detect.sendPrompt(input, submit, state.settings.submitMethod);

    await detect.waitForResult(beforeMap, { need: state.settings.imagesPerPrompt, timeoutMs: state.settings.timeoutPerPromptMs });
  }

  async function runLoop() {
    if (loopRunning) return;
    loopRunning = true;

    while (true) {
      const state = await getState();
      if (!state.running) break;
      if (state.paused) { await new Promise(r => setTimeout(r, 500)); continue; }

      const pending = state.queue.find(q => q.status === 'pending');
      if (!pending) {
        state.running = false;
        await saveState(state);
        chrome.runtime.sendMessage({ type: 'QUEUE_COMPLETE' }).catch(() => {});
        break;
      }

      pending.status = 'running';
      pending.startedAt = Date.now();
      await saveState(state);

      try {
        await processOne(pending, state);
        pending.status = 'done';
        pending.finishedAt = Date.now();
        log(`Completado: ${pending.text.slice(0, 50)}...`);
      } catch (err) {
        logError(err.name || 'ERROR', err.message);
        if (state.settings.maxRetries > 0 && !pending.retryCount) {
          pending.retryCount = 1;
          pending.status = 'pending';
          await saveState(state);
          await new Promise(r => setTimeout(r, 5000));
          continue;
        }
        pending.status = 'error';
        pending.error = `${err.name || 'ERROR'}: ${err.message}`;
        pending.finishedAt = Date.now();

        const updated = await getState();
        const recentErrors = updated.queue.filter(q => q.status === 'error').slice(-3);
        if (recentErrors.length >= 3) {
          updated.paused = true;
          await saveState(updated);
          log('3 errores seguidos: cola pausada');
        }
      }
      await saveState(state);
      await new Promise(r => setTimeout(r, state.settings.delayBetweenMs + Math.random() * 1500));
    }
    loopRunning = false;
  }

  function startLoop(frameId) {
    if (loopRunning) return { success: false, error: 'Ya hay un bucle ejecutándose' };
    currentFrameId = frameId;
    runLoop();
    return { success: true };
  }

  function stopLoop() {
    getState().then(state => {
      state.running = false;
      state.paused = false;
      saveState(state);
    });
    loopRunning = false;
    return { success: true };
  }

  function pauseLoop() {
    getState().then(state => { state.paused = true; saveState(state); });
    return { success: true };
  }

  function resumeLoop() {
    getState().then(state => { state.paused = false; saveState(state); });
    return { success: true };
  }

  function ensureDetected(frameId) {
    try {
      const inputs = detect.findInputs();
      const bestInput = inputs[0] || null;
      const submitResult = bestInput ? detect.findSubmit(bestInput.el) : { best: null, alternatives: [] };
      return { success: true, input: bestInput, submit: submitResult.best, alternatives: submitResult.alternatives };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  function testElement(selector, type) {
    const elements = detect.deepQuerySelectorAll(selector);
    if (type === 'input') {
      const el = elements[0];
      if (el) return detect.testType(el);
    } else {
      elements.forEach(el => detect.highlight(el, type === 'submit' ? 'ENVIAR' : 'RESULTADO', type === 'submit' ? '#22c55e' : '#6366F1'));
    }
    return { success: true, count: elements.length };
  }

  function getSiteProfile(hostname) {
    return new Promise(resolve => {
      chrome.storage.local.get('siteProfiles', data => {
        resolve(data.siteProfiles?.[hostname] || null);
      });
    });
  }

  function clearSiteProfile(hostname) {
    return new Promise(resolve => {
      chrome.storage.local.get('siteProfiles', data => {
        const profiles = data.siteProfiles || {};
        delete profiles[hostname];
        chrome.storage.local.set({ siteProfiles: profiles }, resolve);
      });
    });
  }

  function getLogs() {
    return new Promise(resolve => chrome.storage.local.get(LOG_KEY, d => resolve(d[LOG_KEY] || [])));
  }

  function clearLogs() {
    return new Promise(resolve => chrome.storage.local.set({ [LOG_KEY]: [] }, resolve));
  }

  function handleMessage(message) {
    switch (message.type) {
      case 'PING':
        return { ok: true, version: chrome.runtime.getManifest().version };
      case 'START_LOOP':
        return startLoop(message.frameId);
      case 'STOP_LOOP':
        return stopLoop();
      case 'PAUSE_LOOP':
        return pauseLoop();
      case 'RESUME_LOOP':
        return resumeLoop();
      case 'ENSURE_DETECTED':
        return ensureDetected(message.frameId);
      case 'TEST_ELEMENT':
        return testElement(message.selector, message.elementType);
      case 'GET_PROFILE':
        return getSiteProfile(message.hostname);
      case 'CLEAR_PROFILE':
        return clearSiteProfile(message.hostname);
      case 'GET_LOGS':
        return getLogs();
      case 'CLEAR_LOGS':
        return clearLogs();
      case 'PICK_INPUT':
        detect.startPick('input');
        return { success: true };
      case 'PICK_SUBMIT':
        detect.startPick('submit');
        return { success: true };
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    Promise.resolve(handleMessage(message)).then(sendResponse).catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[STORAGE_KEY]) {
      const state = changes[STORAGE_KEY].newValue || defaultState();
      if (state.running && !loopRunning) runLoop();
      else if (!state.running) loopRunning = false;
    }
  });

  log(`Content script listo en frame ${currentFrameId || 'top'}`);
  window.__colaPromptsContent = { runLoop, stopLoop, pauseLoop, resolveTargets, ensureDetected };
})();