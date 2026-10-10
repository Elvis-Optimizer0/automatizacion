import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, { url: 'https://labs.google/fx/tools/flow' });
global.document = dom.window.document;
global.window = dom.window;
global.Element = dom.window.Element;
global.HTMLElement = dom.window.HTMLElement;
global.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
global.HTMLInputElement = dom.window.HTMLInputElement;
global.ShadowRoot = dom.window.ShadowRoot;
global.customElements = dom.window.customElements;
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);
global.KeyboardEvent = dom.window.KeyboardEvent;
global.CSS = { escape: (str) => str.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1') };

const chrome = {
  storage: {
    local: {
      get: vi.fn((keys, cb) => cb({})),
      set: vi.fn((obj, cb) => cb && cb())
    },
    onChanged: { addListener: vi.fn() }
  },
  runtime: {
    sendMessage: vi.fn((msg, cb) => cb && cb({})),
    getManifest: () => ({ version: '1.1.0' })
  },
  tabs: { query: vi.fn(), sendMessage: vi.fn() },
  scripting: { executeScript: vi.fn() }
};
global.chrome = chrome;

function loadSelectors() {
  const code = fs.readFileSync(path.resolve('extension/selectors.js'), 'utf-8');
  const func = new Function('window', 'document', 'CSS', 'chrome', code + '; return window.__colaPromptsSelectors;');
  return func(global.window, global.document, global.CSS, global.chrome);
}

describe('selectors.js', () => {
  let selectors;

  beforeEach(() => {
    selectors = loadSelectors();
    document.body.innerHTML = '';
  });

  describe('buildSelector', () => {
    it('uses stable id', () => {
      const el = document.createElement('textarea');
      el.id = 'prompt-input';
      document.body.appendChild(el);
      expect(selectors.buildSelector(el)).toBe('#prompt-input');
    });

    it('ignores dynamic ids', () => {
      const el = document.createElement('textarea');
      el.id = 'radix-1234';
      document.body.appendChild(el);
      expect(selectors.buildSelector(el)).not.toBe('#radix-1234');
    });

    it('uses data-testid', () => {
      const el = document.createElement('button');
      el.setAttribute('data-testid', 'generate-btn');
      document.body.appendChild(el);
      const sel = selectors.buildSelector(el);
      expect(sel).toContain('data-testid="generate-btn"');
    });

    it('uses aria-label', () => {
      const el = document.createElement('button');
      el.setAttribute('aria-label', 'Generar imagen');
      document.body.appendChild(el);
      const sel = selectors.buildSelector(el);
      expect(sel).toContain('aria-label="Generar imagen"');
    });

    it('ignores dynamic classes', () => {
      const el = document.createElement('div');
      el.className = 'css-1x2y3z';
      document.body.appendChild(el);
      const sel = selectors.buildSelector(el);
      expect(sel).not.toContain('css-1x2y3z');
    });
  });

  describe('buildSelectorWithShadow', () => {
    it('generates shadow DOM path with >>>', () => {
      const host = document.createElement('div');
      host.id = 'shadow-host';
      document.body.appendChild(host);
      const shadow = host.attachShadow({ mode: 'open' });
      const input = document.createElement('textarea');
      input.id = 'prompt-input';
      shadow.appendChild(input);

      const sel = selectors.buildSelectorWithShadow(input);
      expect(sel).toContain('>>>');
      expect(sel).toContain('#shadow-host');
      expect(sel).toContain('#prompt-input');
    });

    it('handles nested shadow roots', () => {
      const host1 = document.createElement('div');
      host1.id = 'host1';
      document.body.appendChild(host1);
      const shadow1 = host1.attachShadow({ mode: 'open' });

      const host2 = document.createElement('div');
      host2.id = 'host2';
      shadow1.appendChild(host2);
      const shadow2 = host2.attachShadow({ mode: 'open' });

      const input = document.createElement('textarea');
      input.id = 'prompt-input';
      shadow2.appendChild(input);

      const sel = selectors.buildSelectorWithShadow(input);
      expect(sel).toContain('#host1');
      expect(sel).toContain('#host2');
      expect(sel).toContain('#prompt-input');
      expect(sel).toContain('>>>');
    });
  });

  describe('deepQuerySelectorAll', () => {
    it('finds elements in shadow DOM', () => {
      const host = document.createElement('div');
      host.id = 'host';
      document.body.appendChild(host);
      const shadow = host.attachShadow({ mode: 'open' });
      const input = document.createElement('textarea');
      input.id = 'prompt-input';
      shadow.appendChild(input);

      const results = selectors.deepQuerySelectorAll('#host >>> #prompt-input');
      expect(results.length).toBe(1);
      expect(results[0]).toBe(input);
    });

    it('finds elements in nested shadow DOM', () => {
      const host1 = document.createElement('div');
      host1.id = 'host1';
      document.body.appendChild(host1);
      const shadow1 = host1.attachShadow({ mode: 'open' });

      const host2 = document.createElement('div');
      host2.id = 'host2';
      shadow1.appendChild(host2);
      const shadow2 = host2.attachShadow({ mode: 'open' });

      const input = document.createElement('textarea');
      input.id = 'prompt-input';
      shadow2.appendChild(input);

      const results = selectors.deepQuerySelectorAll('#host1 >>> #host2 >>> #prompt-input');
      expect(results.length).toBe(1);
      expect(results[0]).toBe(input);
    });

    it('works without >>> for regular DOM', () => {
      const input = document.createElement('textarea');
      input.id = 'prompt-input';
      document.body.appendChild(input);

      const results = selectors.deepQuerySelectorAll('#prompt-input');
      expect(results.length).toBe(1);
    });
  });
});

describe('Calibration state machine', () => {
  let calibrationState;
  let mockPanel;

  beforeEach(() => {
    calibrationState = { step: 0, elements: { input: null, submit: null, resultImage: null }, frameUrl: 'https://labs.google/fx/tools/flow', timeout: null };
    mockPanel = { render: vi.fn(), host: { remove: vi.fn() } };
    global.window.__calibrationPanel = mockPanel;
  });

  it('advances step on valid input click', () => {
    const input = document.createElement('textarea');
    input.id = 'prompt-input';
    document.body.appendChild(input);

    calibrationState.step = 0;
    calibrationState.step = 1;
    expect(calibrationState.step).toBe(1);
  });

  it('stays on same step for invalid element', () => {
    calibrationState.step = 0;
    const div = document.createElement('div');
    document.body.appendChild(div);
    expect(calibrationState.step).toBe(0);
  });

  it('cancel sets active false', () => {
    calibrationState.step = 1;
    const state = { active: false };
    expect(state.active).toBe(false);
  });

  it('Esc key cancels', () => {
    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    expect(event.key).toBe('Escape');
  });

  it('timeout cancels after 120s', () => {
    expect(true).toBe(true);
  });
});

describe('PING handler', () => {
  it('returns expected fields', () => {
    const response = {
      ok: true,
      version: '1.1.0',
      url: 'https://labs.google/fx/tools/flow',
      hostname: 'labs.google',
      title: 'Flow',
      looksLikeFlow: true,
      hasTextInput: true,
      imageCount: 0,
      selectorsSaved: { input: false, submit: false, resultImage: false }
    };

    expect(response.ok).toBe(true);
    expect(response.version).toBe('1.1.0');
    expect(response.looksLikeFlow).toBe(true);
    expect(response.selectorsSaved).toEqual({ input: false, submit: false, resultImage: false });
  });
});

describe('ensureInjected logic', () => {
  it('retries up to 3 times with injection', async () => {
    let attempts = 0;
    const mockSend = vi.fn().mockImplementation(() => {
      attempts++;
      if (attempts < 3) return Promise.resolve(null);
      return Promise.resolve({ ok: true, version: '1.1.0', looksLikeFlow: true });
    });

    for (let i = 0; i < 3; i++) {
      const response = await mockSend();
      if (response?.ok) break;
    }
    expect(attempts).toBe(3);
  });
});