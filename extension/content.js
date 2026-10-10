const { getUniqueSelector, getGenericImageSelector, setPromptText, clickSubmit, waitForGenerationDone } = require('./selectors.js');

let processing = false;
let shouldStop = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message.type) {
      case 'START_PROCESSING': {
        if (processing) {
          sendResponse({ success: false, error: 'Ya está procesando' });
          break;
        }
        processing = true;
        shouldStop = false;
        await processQueue();
        processing = false;
        sendResponse({ success: true });
        break;
      }
      case 'STOP_PROCESSING': {
        shouldStop = true;
        sendResponse({ success: true });
        break;
      }
      case 'CALIBRATE_START': {
        enterCalibrationMode();
        sendResponse({ success: true });
        break;
      }
    }
  })();
  return true;
});

async function processQueue() {
  const state = await getState();
  if (!state.running || state.paused) return;

  const pendingItem = state.queue.find(q => q.status === 'pending');
  if (!pendingItem) {
    await chrome.runtime.sendMessage({ type: 'QUEUE_COMPLETE' });
    const updatedState = await getState();
    updatedState.running = false;
    await saveState(updatedState);
    await chrome.runtime.sendMessage({ type: 'STATE_UPDATE', state: updatedState });
    return;
  }

  const { selectors, settings } = state;
  const inputEl = document.querySelector(selectors.input);
  const submitEl = document.querySelector(selectors.submit);

  if (!inputEl || !submitEl) {
    await updateItem(pendingItem.id, { status: 'error', error: 'Selectores no encontrados en la página' });
    return;
  }

  await updateItem(pendingItem.id, { status: 'running', startedAt: Date.now() });

  for (let attempt = 0; attempt <= settings.maxRetries; attempt++) {
    if (shouldStop) return;

    try {
      const beforeCount = document.querySelectorAll(selectors.resultImage).length;

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
      break;
    } catch (err) {
      if (attempt === settings.maxRetries) {
        await updateItem(pendingItem.id, { status: 'error', error: err.message, finishedAt: Date.now() });

        const updatedState = await getState();
        const recentErrors = updatedState.queue.filter(q => q.status === 'error').slice(-3);
        if (recentErrors.length >= 3) {
          updatedState.paused = true;
          await saveState(updatedState);
          await chrome.runtime.sendMessage({ type: 'STATE_UPDATE', state: updatedState });
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

function enterCalibrationMode() {
  let step = 0;
  const elements = { input: null, submit: null, resultImage: null };
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;pointer-events:none;background:rgba(0,0,0,0.3);';
  document.body.appendChild(overlay);

  const tooltip = document.createElement('div');
  tooltip.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1a1a2e;color:white;padding:16px 24px;border-radius:12px;font:14px system-ui;z-index:2147483648;box-shadow:0 8px 32px rgba(0,0,0,0.4);max-width:90vw;text-align:center;';
  tooltip.innerHTML = '<strong>Calibración - Paso 1/3</strong><br>Haz clic en la <strong>caja de texto</strong> donde se escribe el prompt';
  document.body.appendChild(tooltip);

  let highlightEl = null;

  function updateHighlight(el) {
    if (highlightEl) highlightEl.remove();
    if (!el) return;
    const rect = el.getBoundingClientRect();
    highlightEl = document.createElement('div');
    highlightEl.style.cssText = `position:fixed;left:${rect.left-2}px;top:${rect.top-2}px;width:${rect.width+4}px;height:${rect.height+4}px;border:3px solid #6366F1;border-radius:4px;pointer-events:none;z-index:2147483647;box-shadow:0 0 0 9999px rgba(0,0,0,0.3);`;
    document.body.appendChild(highlightEl);
  }

  function onMouseOver(e) {
    if (e.target === overlay || e.target === tooltip || e.target === highlightEl) return;
    updateHighlight(e.target);
  }

  function onClick(e) {
    if (e.target === overlay || e.target === tooltip || e.target === highlightEl) return;
    e.preventDefault();
    e.stopPropagation();

    const selector = getUniqueSelector(e.target);
    if (!selector) {
      alert('No se pudo generar un selector único. Intenta con otro elemento.');
      return;
    }

    elements[['input', 'submit', 'resultImage'][step]] = { selector, element: e.target };
    step++;

    if (step === 1) {
      tooltip.innerHTML = '<strong>Calibración - Paso 2/3</strong><br>Haz clic en el <strong>botón "Generar"</strong>';
    } else if (step === 2) {
      tooltip.innerHTML = '<strong>Calibración - Paso 3/3</strong><br>Haz clic en una <strong>imagen ya generada</strong> (resultado)';
    } else {
      finishCalibration();
      return;
    }
  }

  function finishCalibration() {
    document.removeEventListener('mouseover', onMouseOver, true);
    document.removeEventListener('click', onClick, true);
    overlay.remove();
    tooltip.remove();
    if (highlightEl) highlightEl.remove();

    const resultImageSelector = getGenericImageSelector(elements.resultImage.element);
    const busySelector = elements.resultImage.element?.closest('[class*="loading"], [class*="spinner"], [class*="busy"]') ?
      getUniqueSelector(elements.resultImage.element.closest('[class*="loading"], [class*="spinner"], [class*="busy"]')) : null;

    chrome.runtime.sendMessage({
      type: 'SAVE_SELECTORS',
      selectors: {
        input: elements.input.selector,
        submit: elements.submit.selector,
        resultImage: resultImageSelector,
        busyIndicator: busySelector
      }
    });
  }

  document.addEventListener('mouseover', onMouseOver, true);
  document.addEventListener('click', onClick, true);
}

async function getState() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, response => resolve(response.state));
  });
}

async function saveState(state) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'SAVE_STATE', state }, resolve);
  });
}

async function updateItem(id, updates) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'ITEM_UPDATE', id, updates }, resolve);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {});
}