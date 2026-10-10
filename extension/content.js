(function () {
  if (window.__colaPromptsContentLoaded) return;
  window.__colaPromptsContentLoaded = true;

  const { getUniqueSelector, getGenericImageSelector, setPromptText, clickSubmit, waitForGenerationDone, buildSelectorWithShadow, deepQuerySelectorAll } = window.__colaPromptsSelectors;

  const LOG_KEY = 'colaPromptsLogs';
  const MAX_LOGS = 50;

  function log(message) {
    const time = new Date().toLocaleTimeString('es-ES', { hour12: false });
    const entry = `${time} ${message}`;
    chrome.storage.local.get(LOG_KEY, (data) => {
      const logs = (data[LOG_KEY] || []).slice(-MAX_LOGS + 1);
      logs.push(entry);
      chrome.storage.local.set({ [LOG_KEY]: logs });
    });
    console.log('[ColaPrompts]', entry);
  }

  function logError(code, message) {
    log(`ERROR [${code}]: ${message}`);
  }

  function getState() {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'GET_STATE' }, response => resolve(response?.state));
    });
  }

  function saveState(state) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'SAVE_STATE', state }, resolve);
    });
  }

  function updateItem(id, updates) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'ITEM_UPDATE', id, updates }, resolve);
    });
  }

  function notifyPopup(state) {
    chrome.runtime.sendMessage({ type: 'STATE_UPDATE', state }).catch(() => {});
  }

  function findInputElement(root = document) {
    const selectors = 'textarea, input[type="text"], input:not([type]), [contenteditable=""], [contenteditable="true"], [role="textbox"]';
    const elements = Array.from(root.querySelectorAll(selectors)).filter(el => {
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth > 0 && el.offsetHeight > 0;
    });
    if (elements.length === 0) return null;
    return elements.reduce((best, el) => {
      const area = el.offsetWidth * el.offsetHeight;
      return area > best.area ? { el, area } : best;
    }, { el: elements[0], area: 0 }).el;
  }

  function findSubmitElement(inputEl, root = document) {
    const candidates = Array.from(root.querySelectorAll('button, [role="button"], input[type="submit"], a')).filter(el => {
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth > 0 && el.offsetHeight > 0;
    });
    if (candidates.length === 0) return null;

    const inputRect = inputEl.getBoundingClientRect();
    const scored = candidates.map(el => {
      const rect = el.getBoundingClientRect();
      const distance = Math.hypot(rect.left - inputRect.right, rect.top - inputRect.top);
      const text = (el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || '').toLowerCase();
      const hasGenerateText = /(generar|generate|crear|create|enviar|send|submit|run)/i.test(text);
      const isIconOnly = el.textContent.trim().length === 0 && el.querySelector('svg, img, i');
      let score = distance;
      if (hasGenerateText) score -= 200;
      if (isIconOnly && rect.right > inputRect.right) score -= 100;
      return { el, score };
    });
    scored.sort((a, b) => a.score - b.score);
    return scored[0].el;
  }

  function findResultImageElement(root = document) {
    const images = Array.from(root.querySelectorAll('img, video, canvas')).filter(el => {
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth >= 256 && el.offsetHeight >= 256;
    });
    if (images.length === 0) return null;
    return images.reduce((best, el) => {
      const area = el.offsetWidth * el.offsetHeight;
      return area > best.area ? { el, area } : best;
    }, { el: images[0], area: 0 }).el;
  }

  function getElementKind(el) {
    if (el.tagName === 'IMG') return 'img';
    if (el.tagName === 'VIDEO') return 'video';
    if (el.tagName === 'CANVAS') return 'canvas';
    const bg = window.getComputedStyle(el).backgroundImage;
    if (bg && bg !== 'none') return 'background';
    return 'img';
  }

  function validateSelector(selector, type) {
    const elements = deepQuerySelectorAll(selector);
    if (elements.length === 0) return false;
    if (type === 'input' || type === 'submit') return elements.length === 1;
    return true;
  }

  function saveSelector(key, selector, meta) {
    return new Promise(resolve => {
      chrome.storage.local.get(['selectors', 'selectorMeta'], (data) => {
        const selectors = { ...data.selectors, [key]: selector };
        const selectorMeta = { ...data.selectorMeta, [key]: meta };
        chrome.storage.local.set({ selectors, selectorMeta }, resolve);
      });
    });
  }

  function flashElement(el, color = '#22c55e') {
    if (!el) return;
    const originalOutline = el.style.outline;
    const originalOutlineOffset = el.style.outlineOffset;
    el.style.outline = `3px solid ${color}`;
    el.style.outlineOffset = '2px';
    setTimeout(() => {
      el.style.outline = originalOutline;
      el.style.outlineOffset = originalOutlineOffset;
    }, 600);
  }

  function showCalibrationPanel(step, message) {
    if (window.__calibrationPanel) return window.__calibrationPanel;

    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:2147483647;font-family:system-ui;pointer-events:none;';
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });
    const panel = document.createElement('div');
    panel.style.cssText = `
      background:#1a1a2e;color:white;padding:16px 24px;border-radius:12px;
      box-shadow:0 8px 32px rgba(0,0,0,0.4);max-width:90vw;text-align:center;
      border:2px solid #6366F1;font-size:16px;pointer-events:auto;
    `;
    shadow.appendChild(panel);

    const style = document.createElement('style');
    style.textContent = `
      .calib-btn { margin-top:12px;padding:8px 16px;background:#ef4444;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px; }
      .calib-btn:hover { background:#dc2626; }
      .step-badge { display:inline-block;background:#6366F1;padding:2px 8px;border-radius:4px;font-size:12px;margin-bottom:8px; }
      .feedback { margin-top:8px;padding:8px;border-radius:6px;font-size:14px; }
      .feedback.success { background:#166534;color:#bbf7d0; }
      .feedback.warning { background:#854d0e;color:#fde68a; }
    `;
    shadow.appendChild(style);

    function render(step, message, feedback = null) {
      panel.innerHTML = `
        <span class="step-badge">Calibración · Paso ${step + 1} de 3</span>
        <div>${message}</div>
        ${feedback ? `<div class="feedback ${feedback.type}">${feedback.text}</div>` : ''}
        <button class="calib-btn" id="calib-cancel">Cancelar</button>
      `;
      shadow.getElementById('calib-cancel').onclick = cancelCalibration;
    }

    render(step, message);

    window.__calibrationPanel = { host, shadow, panel, render };
    return window.__calibrationPanel;
  }

  function hideCalibrationPanel() {
    if (window.__calibrationPanel) {
      window.__calibrationPanel.host.remove();
      window.__calibrationPanel = null;
    }
  }

  function cancelCalibration() {
    chrome.storage.local.set({ calibration: { active: false } });
    hideCalibrationPanel();
    removeHighlightListeners();
  }

  function highlightElement(el) {
    if (window.__calibHighlight) window.__calibHighlight.remove();
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const div = document.createElement('div');
    div.style.cssText = `position:fixed;left:${rect.left-2}px;top:${rect.top-2}px;width:${rect.width+4}px;height:${rect.height+4}px;border:3px solid #6366F1;border-radius:4px;pointer-events:none;z-index:2147483647;box-shadow:0 0 0 9999px rgba(0,0,0,0.3);`;
    document.body.appendChild(div);
    window.__calibHighlight = div;
  }

  function removeHighlightListeners() {
    document.removeEventListener('mousemove', window.__calibMouseMove, true);
    document.removeEventListener('mousedown', window.__calibMouseDown, true);
    document.removeEventListener('mouseup', window.__calibMouseUp, true);
    document.removeEventListener('pointerdown', window.__calibPointerDown, true);
    document.removeEventListener('pointerup', window.__calibPointerUp, true);
    document.removeEventListener('click', window.__calibClick, true);
    document.removeEventListener('keydown', window.__calibKeyDown, true);
    if (window.__calibHighlight) window.__calibHighlight.remove();
  }

  let calibrationState = { step: 0, elements: { input: null, submit: null, resultImage: null }, frameUrl: location.href, timeout: null };

  function startCalibration() {
    calibrationState = { step: 0, elements: { input: null, submit: null, resultImage: null }, frameUrl: location.href, timeout: null };
    showCalibrationPanel(0, 'Haz clic en la <strong>CAJA DONDE SE ESCRIBE EL PROMPT</strong>');

    const messages = [
      'Haz clic en la <strong>CAJA DONDE SE ESCRIBE EL PROMPT</strong>',
      'Haz clic en el <strong>BOTÓN QUE GENERA LA IMAGEN</strong>',
      'Haz clic en una <strong>IMAGEN YA GENERADA</strong>'
    ];

    function onMouseMove(e) {
      if (e.target === window.__calibrationPanel?.host || e.target.closest?.('#calib-cancel')) return;
      highlightElement(e.target);
    }

    async function handleClick(e) {
      if (e.target === window.__calibrationPanel?.host || e.target.closest?.('#calib-cancel')) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const target = e.composedPath()[0];
      const step = calibrationState.step;

      if (step === 0) {
        const inputEl = findInputElementFromTarget(target);
        if (!inputEl) {
          window.__calibrationPanel.render(0, messages[0], { type: 'warning', text: 'No parece una caja de texto, prueba con otro clic' });
          return;
        }
        const selector = buildSelectorWithShadow(inputEl);
        if (!selector || !validateSelector(selector, 'input')) {
          window.__calibrationPanel.render(0, messages[0], { type: 'warning', text: 'Selector no único, prueba con otro elemento' });
          return;
        }
        const meta = { tag: inputEl.tagName, ariaLabel: inputEl.getAttribute('aria-label'), placeholder: inputEl.getAttribute('placeholder'), text: (inputEl.value || inputEl.textContent || '').substring(0, 30), frameUrl: location.href };
        await saveSelector('input', selector, meta);
        calibrationState.elements.input = { selector, element: inputEl };
        flashElement(inputEl);
        window.__calibrationPanel.render(1, messages[1], { type: 'success', text: '✔ Caja de texto guardada' });
        setTimeout(() => window.__calibrationPanel.render(1, messages[1]), 1000);
        calibrationState.step = 1;
      } else if (step === 1) {
        const submitEl = findSubmitElementFromTarget(target);
        if (!submitEl) {
          window.__calibrationPanel.render(1, messages[1], { type: 'warning', text: 'No parece un botón, prueba con otro clic' });
          return;
        }
        const selector = buildSelectorWithShadow(submitEl);
        if (!selector || !validateSelector(selector, 'submit')) {
          window.__calibrationPanel.render(1, messages[1], { type: 'warning', text: 'Selector no único, prueba con otro elemento' });
          return;
        }
        const meta = { tag: submitEl.tagName, ariaLabel: submitEl.getAttribute('aria-label'), text: (submitEl.textContent || '').substring(0, 30), frameUrl: location.href };
        await saveSelector('submit', selector, meta);
        calibrationState.elements.submit = { selector, element: submitEl };
        flashElement(submitEl);
        window.__calibrationPanel.render(2, messages[2], { type: 'success', text: '✔ Botón generar guardado' });
        setTimeout(() => window.__calibrationPanel.render(2, messages[2]), 1000);
        calibrationState.step = 2;
      } else if (step === 2) {
        const imgEl = findResultImageElementFromTarget(target);
        if (!imgEl) {
          window.__calibrationPanel.render(2, messages[2], { type: 'warning', text: 'No parece una imagen/video, prueba con otro clic' });
          return;
        }
        const selector = getGenericImageSelector(imgEl);
        const kind = getElementKind(imgEl);
        const meta = { tag: imgEl.tagName, kind, frameUrl: location.href };
        await saveSelector('resultImage', selector, meta);
        calibrationState.elements.resultImage = { selector, element: imgEl };
        flashElement(imgEl);
        window.__calibrationPanel.render(2, messages[2], { type: 'success', text: '✔ Imagen resultado guardada' });
        setTimeout(() => {
          finishCalibration();
        }, 1500);
      }
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') cancelCalibration();
    }

    window.__calibMouseMove = onMouseMove;
    window.__calibMouseDown = handleClick;
    window.__calibMouseUp = handleClick;
    window.__calibPointerDown = handleClick;
    window.__calibPointerUp = handleClick;
    window.__calibClick = handleClick;
    window.__calibKeyDown = onKeyDown;

    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('mousedown', handleClick, true);
    document.addEventListener('mouseup', handleClick, true);
    document.addEventListener('pointerdown', handleClick, true);
    document.addEventListener('pointerup', handleClick, true);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', onKeyDown, true);

    calibrationState.timeout = setTimeout(cancelCalibration, 120000);
  }

  function findInputElementFromTarget(target) {
    let el = target;
    while (el && el !== document.body) {
      if (el.matches?.('textarea, input[type="text"], input:not([type]), [contenteditable=""], [contenteditable="true"], [role="textbox"]')) {
        return el;
      }
      const found = el.querySelector?.('textarea, input[type="text"], input:not([type]), [contenteditable=""], [contenteditable="true"], [role="textbox"]');
      if (found) return found;
      el = el.parentElement || (el.getRootNode?.()?.host);
    }
    return null;
  }

  function findSubmitElementFromTarget(target) {
    let el = target;
    while (el && el !== document.body) {
      if (el.matches?.('button, [role="button"], input[type="submit"], a')) {
        return el;
      }
      el = el.parentElement || (el.getRootNode?.()?.host);
    }
    return target;
  }

  function findResultImageElementFromTarget(target) {
    let el = target;
    while (el && el !== document.body) {
      if (el.matches?.('img, video, canvas') || window.getComputedStyle(el).backgroundImage !== 'none') {
        return el;
      }
      const found = el.querySelector?.('img, video, canvas');
      if (found) return found;
      el = el.parentElement || (el.getRootNode?.()?.host);
    }
    return null;
  }

  function finishCalibration() {
    removeHighlightListeners();
    hideCalibrationPanel();
    if (calibrationState.timeout) clearTimeout(calibrationState.timeout);
    chrome.storage.local.set({ calibration: { active: false } });
    log('Calibración completada');
  }

  let processing = false;
  let shouldStop = false;
  let loopId = 0;

  async function processQueue() {
    if (processing) return;
    const state = await getState();
    if (!state.running || state.paused) return;

    const pendingItem = state.queue.find(q => q.status === 'pending');
    if (!pendingItem) {
      await chrome.runtime.sendMessage({ type: 'QUEUE_COMPLETE' });
      const updatedState = await getState();
      updatedState.running = false;
      await saveState(updatedState);
      await notifyPopup(updatedState);
      return;
    }

    const { selectors, settings } = state;
    if (!selectors.input || !selectors.submit || !selectors.resultImage) {
      await updateItem(pendingItem.id, { status: 'error', error: 'Faltan selectores calibrados' });
      return;
    }

    const inputEl = deepQuerySelectorAll(selectors.input)[0];
    const submitEl = deepQuerySelectorAll(selectors.submit)[0];

    if (!inputEl || !submitEl) {
      await updateItem(pendingItem.id, { status: 'error', error: 'Selectores no encontrados en la página' });
      return;
    }

    await updateItem(pendingItem.id, { status: 'running', startedAt: Date.now() });

    for (let attempt = 0; attempt <= settings.maxRetries; attempt++) {
      if (shouldStop) return;

      try {
        const beforeCount = deepQuerySelectorAll(selectors.resultImage).length;

        await setPromptText(inputEl, pendingItem.text);
        await clickSubmit(submitEl);

        await waitForGenerationDone(
          selectors.resultImage,
          beforeCount,
          settings.imagesPerPrompt,
          settings.timeoutPerPromptMs,
          selectors.busyIndicator
        );

        await updateItem(pendingItem.id, { status: 'done', finishedAt: Date.now() });
        log(`Prompt completado: ${pendingItem.text.substring(0, 50)}...`);
        break;
      } catch (err) {
        logError(err.name || 'ERROR', err.message);
        if (attempt === settings.maxRetries) {
          await updateItem(pendingItem.id, { status: 'error', error: err.message, finishedAt: Date.now() });

          const updatedState = await getState();
          const recentErrors = updatedState.queue.filter(q => q.status === 'error').slice(-3);
          if (recentErrors.length >= 3) {
            updatedState.paused = true;
            await saveState(updatedState);
            await notifyPopup(updatedState);
          }
        } else {
          await new Promise(r => setTimeout(r, 5000));
        }
      }
    }

    if (shouldStop) return;

    await new Promise(r => setTimeout(r, settings.delayBetweenMs + Math.random() * 1500));

    if (!shouldStop) {
      await processQueue();
    }
  }

  function startProcessing() {
    const myLoopId = ++loopId;
    processing = true;
    shouldStop = false;
    log('Iniciando procesamiento de cola');
    processQueue().finally(() => {
      if (loopId === myLoopId) processing = false;
    });
  }

  function stopProcessing() {
    shouldStop = true;
    processing = false;
    log('Procesamiento detenido');
  }

  function handleMessage(message, sender, sendResponse) {
    (async () => {
      switch (message.type) {
        case 'PING': {
          const looksLikeFlow = /(^|\.)flow\.google$/.test(location.hostname) || location.hostname === 'labs.google' ||
            !!document.querySelector('textarea, [contenteditable="true"], [role="textbox"]');
          const hasTextInput = !!document.querySelector('textarea, [contenteditable="true"], [role="textbox"]');
          const imageCount = document.querySelectorAll('img, video').length;
          const { selectors = {}, selectorMeta = {} } = await new Promise(r => chrome.storage.local.get(['selectors', 'selectorMeta'], r));
          sendResponse({
            ok: true,
            version: chrome.runtime.getManifest().version,
            url: location.href,
            hostname: location.hostname,
            title: document.title,
            looksLikeFlow,
            hasTextInput,
            imageCount,
            selectorsSaved: {
              input: !!selectors.input,
              submit: !!selectors.submit,
              resultImage: !!selectors.resultImage
            }
          });
          break;
        }
        case 'START_PROCESSING': {
          if (processing) {
            sendResponse({ success: false, error: 'Ya está procesando' });
            break;
          }
          startProcessing();
          sendResponse({ success: true });
          break;
        }
        case 'STOP_PROCESSING': {
          stopProcessing();
          sendResponse({ success: true });
          break;
        }
        case 'CALIBRATE_START': {
          chrome.storage.local.set({ calibration: { active: true, step: 0, startedAt: Date.now() } });
          sendResponse({ success: true });
          break;
        }
        case 'TEST_SELECTOR': {
          const { selector, type } = message;
          const elements = deepQuerySelectorAll(selector);
          if (type === 'input') {
            const el = elements[0];
            if (el) {
              const original = el.value || el.textContent;
              await setPromptText(el, 'prueba');
              setTimeout(() => { el.value = original; el.textContent = original; }, 2000);
            }
          } else if (type === 'submit') {
            elements.forEach(el => flashElement(el, '#6366F1'));
          } else if (type === 'resultImage') {
            elements.forEach(el => flashElement(el, '#6366F1'));
          }
          sendResponse({ success: true, count: elements.length });
          break;
        }
        case 'AUTODETECT': {
          const inputEl = findInputElement();
          const submitEl = inputEl ? findSubmitElement(inputEl) : null;
          const resultEl = findResultImageElement();
          const results = {};
          if (inputEl) {
            const sel = buildSelectorWithShadow(inputEl);
            results.input = { selector: sel, element: inputEl };
          }
          if (submitEl) {
            const sel = buildSelectorWithShadow(submitEl);
            results.submit = { selector: sel, element: submitEl };
          }
          if (resultEl) {
            const sel = getGenericImageSelector(resultEl);
            results.resultImage = { selector: sel, element: resultEl, kind: getElementKind(resultEl) };
          }
          sendResponse({ success: true, results });
          break;
        }
      }
    })();
    return true;
  }

  chrome.runtime.onMessage.addListener(handleMessage);

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;

    if (changes.calibration) {
      const { newValue } = changes.calibration;
      if (newValue?.active && !calibrationState.step) {
        log('Activando modo calibración desde storage');
        startCalibration();
      } else if (newValue?.active === false) {
        cancelCalibration();
      }
    }

    if (changes.promptQueueState) {
      const state = changes.promptQueueState.newValue;
      if (state?.running && !state.paused && !processing) {
        log('Reanudando cola desde storage');
        startProcessing();
      } else if (state && !state.running) {
        stopProcessing();
      }
    }
  });

  log(`Content script cargado en ${location.href}`);
})();