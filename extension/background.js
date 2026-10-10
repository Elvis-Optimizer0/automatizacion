const STORAGE_KEY = 'promptQueueState';

const defaultState = {
  queue: [],
  running: false,
  paused: false,
  settings: {
    delayBetweenMs: 3000,
    timeoutPerPromptMs: 180000,
    maxRetries: 2,
    imagesPerPrompt: 1
  },
  selectors: {
    input: null,
    submit: null,
    resultImage: null,
    busyIndicator: null
  }
};

async function getState() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return { ...defaultState, ...data[STORAGE_KEY] };
}

async function saveState(state) {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

async function notifyPopup(state) {
  chrome.runtime.sendMessage({ type: 'STATE_UPDATE', state }).catch(() => {});
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    const state = await getState();

    switch (message.type) {
      case 'GET_STATE':
        sendResponse({ state });
        break;

      case 'ADD_PROMPTS': {
        const existingTexts = new Set(state.queue.map(q => q.text));
        const newItems = message.prompts
          .filter(p => p && !existingTexts.has(p))
          .map(text => ({
            id: crypto.randomUUID(),
            text,
            status: 'pending',
            error: null,
            startedAt: null,
            finishedAt: null
          }));
        state.queue.push(...newItems);
        await saveState(state);
        await notifyPopup(state);
        sendResponse({ success: true, added: newItems.length });
        break;
      }

      case 'CLEAR_QUEUE': {
        state.queue = [];
        state.running = false;
        state.paused = false;
        await saveState(state);
        await notifyPopup(state);
        sendResponse({ success: true });
        break;
      }

      case 'REMOVE_ITEM': {
        state.queue = state.queue.filter(q => q.id !== message.id);
        await saveState(state);
        await notifyPopup(state);
        sendResponse({ success: true });
        break;
      }

      case 'RETRY_ERRORS': {
        state.queue = state.queue.map(q => q.status === 'error' ? { ...q, status: 'pending', error: null } : q);
        await saveState(state);
        await notifyPopup(state);
        sendResponse({ success: true });
        break;
      }

      case 'START_QUEUE': {
        if (!state.selectors.input || !state.selectors.submit || !state.selectors.resultImage) {
          sendResponse({ success: false, error: 'Primero calibra los selectores' });
          break;
        }
        state.running = true;
        state.paused = false;
        await saveState(state);
        await notifyPopup(state);
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
          if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, { type: 'START_PROCESSING' });
          }
        });
        sendResponse({ success: true });
        break;
      }

      case 'PAUSE_QUEUE': {
        state.paused = true;
        await saveState(state);
        await notifyPopup(state);
        sendResponse({ success: true });
        break;
      }

      case 'STOP_QUEUE': {
        state.running = false;
        state.paused = false;
        state.queue = state.queue.map(q => q.status === 'running' ? { ...q, status: 'pending' } : q);
        await saveState(state);
        await notifyPopup(state);
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
          if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, { type: 'STOP_PROCESSING' });
          }
        });
        sendResponse({ success: true });
        break;
      }

      case 'UPDATE_SETTINGS': {
        state.settings = { ...state.settings, ...message.settings };
        await saveState(state);
        await notifyPopup(state);
        sendResponse({ success: true });
        break;
      }

      case 'SAVE_SELECTORS': {
        state.selectors = { ...state.selectors, ...message.selectors };
        await saveState(state);
        await notifyPopup(state);
        sendResponse({ success: true });
        break;
      }

      case 'ITEM_UPDATE': {
        const idx = state.queue.findIndex(q => q.id === message.id);
        if (idx >= 0) {
          state.queue[idx] = { ...state.queue[idx], ...message.updates };
          await saveState(state);
          await notifyPopup(state);
        }
        sendResponse({ success: true });
        break;
      }

      case 'EXPORT_STATE': {
        sendResponse({ state: JSON.stringify(state, null, 2) });
        break;
      }

      case 'IMPORT_STATE': {
        try {
          const imported = JSON.parse(message.json);
          Object.assign(state, imported, { running: false, paused: false });
          await saveState(state);
          await notifyPopup(state);
          sendResponse({ success: true });
        } catch {
          sendResponse({ success: false, error: 'JSON inválido' });
        }
        break;
      }
    }
  })();
  return true;
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('google.com')) {
    const state = await getState();
    if (state.running && !state.paused) {
      setTimeout(() => {
        chrome.tabs.sendMessage(tabId, { type: 'START_PROCESSING' }).catch(() => {});
      }, 1000);
    }
  }
});