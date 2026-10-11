const STORAGE_KEY = 'colaPromptsState';
const LOG_KEY = 'colaPromptsLogs';
const MAX_LOGS = 50;

const defaultState = {
  queue: [],
  running: false,
  paused: false,
  settings: { delayBetweenMs: 3000, timeoutPerPromptMs: 180000, maxRetries: 2, imagesPerPrompt: 1, submitMethod: 'auto' },
  siteProfiles: {},
  logs: []
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

function addLog(message) {
  chrome.storage.local.get(LOG_KEY, (data) => {
    const logs = (data[LOG_KEY] || []).slice(-MAX_LOGS + 1);
    logs.push(message);
    chrome.storage.local.set({ [LOG_KEY]: logs });
  });
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
        state.running = true;
        state.paused = false;
        await saveState(state);
        await notifyPopup(state);
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

      case 'SAVE_PROFILE': {
        const hostname = new URL(message.frameUrl).hostname;
        if (!state.siteProfiles[hostname]) state.siteProfiles[hostname] = {};
        state.siteProfiles[hostname] = { ...state.siteProfiles[hostname], ...message.profile, frameUrl: message.frameUrl };
        await saveState(state);
        await notifyPopup(state);
        sendResponse({ success: true });
        break;
      }

      case 'CLEAR_PROFILE': {
        delete state.siteProfiles[message.hostname];
        await saveState(state);
        await notifyPopup(state);
        sendResponse({ success: true });
        break;
      }

      case 'GET_PROFILE': {
        sendResponse({ profile: state.siteProfiles[message.hostname] || null });
        break;
      }

      case 'EXPORT_STATE': {
        const fullState = await getState();
        sendResponse({ state: JSON.stringify(fullState, null, 2) });
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

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local') return;
  if (changes[STORAGE_KEY]) {
    const state = changes[STORAGE_KEY].newValue || defaultState();
    await notifyPopup(state);
  }
});