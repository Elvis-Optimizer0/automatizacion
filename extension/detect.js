(function () {
  if (window.__colaPromptsDetect) return;
  const detect = {};

  // ===== UTILIDADES =====
  function getRect(el) {
    if (window.__rectOf) return window.__rectOf(el);
    return el.getBoundingClientRect();
  }

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) <= 0.05) return false;
    const rect = getRect(el);
    if (rect.width < 40 || rect.height < 16) return false;
    let p = el;
    while (p && p !== document.body && p !== document.documentElement) {
      const ps = window.getComputedStyle(p);
      if (ps.display === 'none' || ps.visibility === 'hidden' || p.hidden || p.getAttribute('aria-hidden') === 'true') return false;
      p = p.parentElement;
    }
    return true;
  }

  function labelOf(el) {
    const parts = [];
    const attrs = ['aria-label', 'title', 'placeholder', 'name', 'id', 'data-testid', 'alt'];
    for (const a of attrs) {
      const v = el.getAttribute(a);
      if (v) parts.push(v);
    }
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      const label = document.querySelector(`label[for="${el.id}"]`);
      if (label) parts.push(label.innerText);
    }
    const text = (el.innerText || '').trim();
    if (text) parts.push(text.slice(0, 60));
    return parts.filter(Boolean).join(' ').toLowerCase();
  }

  function walk(root, cb) {
    cb(root);
    if (root.shadowRoot && root.shadowRoot.mode === 'open') {
      walk(root.shadowRoot, cb);
    }
    const children = root.children || (root.shadowRoot ? root.shadowRoot.children : []);
    for (const child of children) walk(child, cb);
  }

  function deepQuerySelectorAll(selector, root = document) {
    const results = [];
    const parts = selector.split(' >>> ').map(s => s.trim());
    function search(node, partIndex) {
      if (partIndex >= parts.length) return;
      const part = parts[partIndex];
      const elements = node.querySelectorAll(part);
      if (partIndex === parts.length - 1) {
        for (const el of elements) results.push(el);
        return;
      }
      for (const el of elements) {
        if (el.shadowRoot) search(el.shadowRoot, partIndex + 1);
      }
    }
    search(root, 0);
    return results;
  }

  // ===== CAJA DE TEXTO =====
  function findInputs() {
    const candidates = [];
    const isInputType = (el) => {
      const t = el.type;
      return t === 'text' || t === 'search' || !t;
    };
    const excludedTypes = ['password', 'email', 'number', 'tel', 'url', 'file', 'checkbox', 'radio', 'hidden'];

    function check(el) {
      if (!isVisible(el)) return;
      if (el.disabled || el.readOnly || el.getAttribute('aria-disabled') === 'true') return;
      if (el.tagName === 'INPUT') {
        if (excludedTypes.includes(el.type)) return;
        if (!isInputType(el)) return;
      } else if (el.tagName === 'TEXTAREA') {
      } else if (el.isContentEditable || el.getAttribute('contenteditable') === 'true' || el.getAttribute('contenteditable') === '' || el.getAttribute('contenteditable') === 'plaintext-only' || el.getAttribute('role') === 'textbox') {
      } else {
        return;
      }
      const rect = getRect(el);
      const area = rect.width * rect.height;
      const label = labelOf(el);
      let score = Math.log2(Math.max(1, area));
      if (el.tagName === 'TEXTAREA') score += 8;
      else if (el.isContentEditable || el.getAttribute('role') === 'textbox') score += 6;
      if (/(prompt|descri|escrib|write|type|imagin|ask|pregunt|message|mensaje|idea|crea|create|generat|genera|what|qu[ée]|que quieres|want)/i.test(label)) score += 10;
      const centerY = rect.top + rect.height / 2;
      const vh = window.innerHeight;
      if (centerY > vh * 0.6) score += 6;
      else if (centerY > vh * 0.4) score += 3;
      if (document.activeElement === el) score += 5;
      if (/(search|buscar|filter|filtro|email|correo|login|user|usuario|password|contraseñ|nombre|name|url|title|t[ií]tulo|cup[oó]n|coupon|zip|postal)/i.test(label)) score -= 12;
      if (el.type === 'search' && document.querySelectorAll('textarea, [contenteditable], [role="textbox"]').length > 0) score -= 8;
      if (rect.height < 28 && document.querySelectorAll('textarea, [contenteditable], [role="textbox"]').some(e => isVisible(e) && getRect(e).width * getRect(e).height > area)) score -= 6;
      candidates.push({ el, score, rect, label, type: el.tagName.toLowerCase() });
    }
    walk(document.documentElement, check);
    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, 5);
  }

  // ===== BOTÓN ENVIAR =====
  function findSubmit(inputEl) {
    if (!inputEl) return { best: null, alternatives: [] };
    let container = inputEl;
    for (let i = 0; i < 8 && container; i++) {
      const btns = container.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"], a[role="button"], [tabindex="0"]');
      let hasVisible = false;
      for (const b of btns) if (isVisible(b)) { hasVisible = true; break; }
      if (hasVisible) break;
      container = container.parentElement;
    }
    if (!container || container === document.body) container = document.body;

    const candidates = [];
    const buttons = container.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"], a[role="button"], [tabindex="0"]');
    for (const btn of buttons) {
      if (!isVisible(btn)) continue;
      const wasDisabled = btn.disabled || btn.getAttribute('aria-disabled') === 'true';
      const rect = getRect(btn);
      const label = labelOf(btn);
      let score = 0;
      if (btn.type === 'submit') score += 12;
      else {
        const form = btn.closest('form');
        if (form && form === inputEl.closest('form')) {
          const formBtns = form.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]');
          const visibleBtns = Array.from(formBtns).filter(isVisible);
          if (visibleBtns[visibleBtns.length - 1] === btn) score += 12;
        }
      }
      if (/(generat|generar|crear|create|send|enviar|submit|run|ejecut|imagine|go\b|arrow|flecha|up\b|play|enter|ask|preguntar)/i.test(label)) score += 10;
      const isIconOnly = (btn.querySelector('svg') || btn.querySelector('img')) && !btn.innerText.trim();
      if (isIconOnly) {
        const inputRect = getRect(inputEl);
        if (rect.left >= inputRect.right - 10 || rect.top >= inputRect.bottom - 10) score += 6;
      }
      const inputRect = getRect(inputEl);
      const dist = Math.hypot(rect.left + rect.width/2 - (inputRect.right), rect.top + rect.height/2 - (inputRect.top + inputRect.height/2));
      score += Math.max(0, 8 - dist / 40);
      const formBtns = container.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]');
      const visibleFormBtns = Array.from(formBtns).filter(isVisible);
      if (visibleFormBtns[visibleFormBtns.length - 1] === btn) score += 5;
      if (/(attach|adjunt|upload|subir|add\b|a[ñn]adir|mic|voz|voice|record|grab|setting|ajuste|config|menu|men[uú]|close|cerrar|cancel|clear|borrar|copy|copiar|download|descargar|share|compartir|more|m[aá]s|opcion|opci[oó]n|history|histor|theme|tema|login|sign|regist|stop|detener)/i.test(label)) score -= 15;
      candidates.push({ el: btn, score, rect, label, wasDisabled, type: btn.tagName.toLowerCase() });
    }
    candidates.sort((a, b) => b.score - a.score);
    return { best: candidates[0] || null, alternatives: candidates.slice(1, 4) };
  }

  // ===== ESCRIBIR TEXTO =====
  async function setPromptText(el, text) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'INPUT' ? HTMLInputElement.prototype : null;
    const original = proto ? el.value : el.textContent;
    const trySet = async () => {
      el.focus();
      if (proto) {
        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        setter.call(el, text);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (el.isContentEditable) {
        el.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, text);
      } else {
        el.textContent = text;
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      }
      await new Promise(r => setTimeout(r, 400));
      const current = proto ? el.value : el.textContent;
      const normalized = current.replace(/\s+/g, ' ').trim();
      const target = text.replace(/\s+/g, ' ').trim();
      return normalized.startsWith(target.slice(0, 20));
    };
    if (await trySet()) return true;
    // Respaldo 1: paste simulado
    el.focus();
    document.execCommand('selectAll', false, null);
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 400));
    let current = proto ? el.value : el.textContent;
    let normalized = current.replace(/\s+/g, ' ').trim();
    let target = text.replace(/\s+/g, ' ').trim();
    if (normalized.startsWith(target.slice(0, 20))) return true;
    // Respaldo 2: textContent + InputEvent
    el.textContent = text;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    await new Promise(r => setTimeout(r, 400));
    current = proto ? el.value : el.textContent;
    normalized = current.replace(/\s+/g, ' ').trim();
    if (normalized.startsWith(target.slice(0, 20))) return true;
    throw new Error('TYPE_FAILED');
  }

  // ===== ENVIAR PROMPT =====
  async function sendPrompt(inputEl, submitEl, method) {
    if (method === 'enter' || (method === 'auto' && (!submitEl || submitEl.score < 6))) {
      const events = ['keydown', 'keypress', 'keyup'];
      for (const e of events) inputEl.dispatchEvent(new KeyboardEvent(e, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      return;
    }
    if (method === 'ctrl-enter') {
      const events = ['keydown', 'keypress', 'keyup'];
      for (const e of events) inputEl.dispatchEvent(new KeyboardEvent(e, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, ctrlKey: true, bubbles: true }));
      return;
    }
    // button
    if (submitEl) {
      for (let i = 0; i < 25; i++) {
        if (!submitEl.el.disabled && submitEl.el.getAttribute('aria-disabled') !== 'true') {
          submitEl.el.click();
          return;
        }
        await new Promise(r => setTimeout(r, 200));
      }
      // fallback Enter
      const events = ['keydown', 'keypress', 'keyup'];
      for (const e of events) inputEl.dispatchEvent(new KeyboardEvent(e, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    }
  }

  // ===== SNAPSHOT MEDIA =====
  const canvasPaintCounter = new WeakMap();
  function getMediaKey(el) {
    if (el.tagName === 'IMG') return (el.currentSrc || el.src || '').split('?')[0];
    if (el.tagName === 'VIDEO') return (el.currentSrc || el.src || el.poster || '').split('?')[0];
    if (el.tagName === 'CANVAS') {
      let id = canvasPaintCounter.get(el);
      if (!id) { id = Math.random().toString(36).slice(2); canvasPaintCounter.set(el, id); }
      return `canvas:${id}`;
    }
    if (el.style.backgroundImage && el.style.backgroundImage !== 'none') {
      return `bg:${el.style.backgroundImage.slice(0, 200)}`;
    }
    return '';
  }

  function snapshotMedia(root = document) {
    const map = new Map();
    function walkSnap(node) {
      if (node.shadowRoot && node.shadowRoot.mode === 'open') walkSnap(node.shadowRoot);
      const elements = node.querySelectorAll ? node.querySelectorAll('img, video, canvas') : [];
      for (const el of elements) {
        if (!isVisible(el)) continue;
        const rect = getRect(el);
        if (rect.width < 128 || rect.height < 128) continue;
        const style = window.getComputedStyle(el);
        if (style.borderRadius && parseFloat(style.borderRadius) >= Math.min(rect.width, rect.height) * 0.45 && rect.width < 200) continue;
        if (el.getAttribute('aria-hidden') === 'true') continue;
        const key = getMediaKey(el);
        if (key) map.set(el, key);
      }
      // background-image
      const all = node.querySelectorAll ? node.querySelectorAll('*') : [];
      for (const el of all) {
        if (el === node || (el.shadowRoot && el.shadowRoot.mode === 'open')) continue;
        if (!isVisible(el)) continue;
        const rect = getRect(el);
        if (rect.width < 128 || rect.height < 128) continue;
        if (window.getComputedStyle(el).backgroundImage !== 'none') {
          const key = getMediaKey(el);
          if (key) map.set(el, key);
        }
      }
    }
    walkSnap(root);
    return map;
  }

  // ===== ESPERAR RESULTADO =====
  async function waitForResult(beforeMap, { need = 1, timeoutMs = 180000 }) {
    const start = Date.now();
    let stableCount = 0;
    let lastNewCount = -1;
    let busySeen = false;

    return new Promise((resolve, reject) => {
      const check = () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error('TIMEOUT'));
          return;
        }
        const afterMap = snapshotMedia();
        let newCount = 0;
        for (const [el, key] of afterMap) {
          if (!beforeMap.has(el) || beforeMap.get(el) !== key) {
            if (el.tagName === 'IMG' && !(el.complete && el.naturalWidth > 0)) continue;
            if (el.tagName === 'VIDEO' && el.readyState < 2 && !el.poster) continue;
            newCount++;
          }
        }
        // busy indicator
        let busyEl = null;
        for (const el of document.querySelectorAll('[role="progressbar"], [aria-busy="true"]')) {
          if (isVisible(el)) { busyEl = el; break; }
        }
        if (!busyEl) {
          for (const el of document.querySelectorAll('[class*="spinner" i], [class*="loading" i], [class*="loader" i], [class*="progress" i], [class*="generating" i], [class*="cargando" i], [class*="generando" i]')) {
            if (isVisible(el)) { busyEl = el; break; }
          }
        }
        if (busyEl) {
          busySeen = true;
          if (Date.now() - start > 40000) busyEl = null; // ignore after 40s
        }
        // PAGE_ERROR
        for (const el of document.querySelectorAll('[role="alert"], [role="status"], [class*="toast" i], [class*="error" i]')) {
          const text = (el.textContent || '').toLowerCase();
          if (/(error|l[ií]mite|limit|quota|cuota|try again|intenta de nuevo|no se pudo|failed|unavailable|rate)/i.test(text)) {
            reject(new Error(`PAGE_ERROR: ${text.trim()}`));
            return;
          }
        }
        if (newCount >= need && (!busyEl || !busySeen)) {
          if (newCount === lastNewCount) {
            stableCount++;
            if (stableCount >= 3) {
              resolve(true);
              return;
            }
          } else {
            stableCount = 0;
            lastNewCount = newCount;
          }
        }
        setTimeout(check, 500);
      };
      const observer = new MutationObserver(check);
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcset', 'style', 'class', 'aria-busy', 'poster', 'currentSrc'] });
      const interval = setInterval(check, 500);
      check();
      const origResolve = resolve, origReject = reject;
      resolve = (v) => { observer.disconnect(); clearInterval(interval); origResolve(v); };
      reject = (e) => { observer.disconnect(); clearInterval(interval); origReject(e); };
    });
  }

  // ===== RESALTADO =====
  let highlightHost = null;
  function clearHighlights() {
    if (highlightHost) { highlightHost.remove(); highlightHost = null; }
  }
  function highlight(el, label, color) {
    clearHighlights();
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;pointer-events:none;';
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const rect = getRect(el);
    const box = document.createElement('div');
    box.style.cssText = `position:fixed;left:${rect.left-2}px;top:${rect.top-2}px;width:${rect.width+4}px;height:${rect.height+4}px;border:3px solid ${color};border-radius:4px;box-shadow:0 0 0 9999px rgba(0,0,0,0.3);`;
    shadow.appendChild(box);
    const tag = document.createElement('div');
    tag.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top-24}px;background:${color};color:white;padding:2px 8px;border-radius:4px;font:12px system-ui;white-space:nowrap;z-index:2147483648;`;
    tag.textContent = label;
    shadow.appendChild(tag);
    highlightHost = host;
    setTimeout(clearHighlights, 4000);
  }

  // ===== TEST TYPE =====
  async function testType(el) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'INPUT' ? HTMLInputElement.prototype : null;
    const original = proto ? el.value : el.textContent;
    await setPromptText(el, 'prueba');
    await new Promise(r => setTimeout(r, 1000));
    if (proto) el.value = original;
    else el.textContent = original;
  }

  // ===== SELECTOR =====
  function isDynamicId(id) { return /\d{4,}|^:r|^radix-|^headlessui-/.test(id); }
  function isDynamicClass(cls) { return /\d{3,}|^css-|^jsx-|^[A-Za-z]+_[A-Za-z0-9]{5,}$/.test(cls); }
  function buildSelector(el) {
    const parts = [];
    let current = el;
    let depth = 0;
    while (current && current !== document.documentElement && depth < 6) {
      let selector = '';
      if (current.id && !current.id.startsWith(':') && !isDynamicId(current.id)) {
        selector = `#${CSS.escape(current.id)}`;
        parts.unshift(selector);
        break;
      }
      const attrs = ['data-testid', 'data-id', 'data-cy', 'aria-label', 'role', 'placeholder', 'name', 'type'];
      let found = false;
      for (const attr of attrs) {
        const val = current.getAttribute(attr);
        if (val) {
          selector = `${current.tagName.toLowerCase()}[${attr}="${CSS.escape(val)}"]`;
          found = true;
          break;
        }
      }
      if (!found) {
        const classes = Array.from(current.classList).filter(c => !c.startsWith('_') && !/^\d/.test(c) && c.length > 2 && !isDynamicClass(c));
        if (classes.length > 0) {
          selector = `${current.tagName.toLowerCase()}.${CSS.escape(classes[0])}`;
          found = true;
        }
      }
      if (!found) {
        const parent = current.parentElement || (current.getRootNode?.()?.host);
        const siblings = parent ? Array.from(parent.children).filter(e => e.tagName === current.tagName) : [current];
        const index = siblings.indexOf(current) + 1;
        selector = current.tagName.toLowerCase();
        if (siblings.length > 1) selector += `:nth-of-type(${index})`;
      }
      parts.unshift(selector);
      const parent = current.parentElement || (current.getRootNode?.()?.host);
      if (!parent) break;
      current = parent;
      depth++;
    }
    return parts.join(' >>> ');
  }

  function buildSelectorWithShadow(el) {
    const path = [];
    let current = el;
    while (current && current !== document.documentElement) {
      let sel = buildSelector(current);
      if (!sel) return null;
      const root = current.getRootNode?.();
      if (root && root instanceof ShadowRoot && root.host) {
        const hostSel = buildSelector(root.host);
        if (hostSel) path.unshift(`${hostSel} >>> ${sel}`);
        else path.unshift(sel);
      } else {
        path.unshift(sel);
      }
      const parent = current.parentElement || (root?.host);
      if (!parent) break;
      current = parent;
    }
    return path.join(' >>> ');
  }

  // ===== MODO MANUAL (ELEGIR) =====
  let pickMode = null;
  let pickHighlight = null;

  function startPick(role) {
    pickMode = role;
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;pointer-events:none;background:rgba(0,0,0,0.2);';
    document.body.appendChild(host);
    const panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1a1a2e;color:white;padding:16px 24px;border-radius:12px;font:14px system-ui;z-index:2147483648;box-shadow:0 8px 32px rgba(0,0,0,0.4);max-width:90vw;text-align:center;';
    panel.innerHTML = `<strong>Elegir ${role === 'input' ? 'caja de texto' : 'botón de enviar'}</strong><br>Haz clic en el elemento. Esc para cancelar.`;
    document.body.appendChild(panel);

    function onMouseOver(e) {
      if (e.target === host || e.target === panel || e.target === pickHighlight) return;
      updateHighlight(e.target);
    }
    function updateHighlight(el) {
      if (pickHighlight) pickHighlight.remove();
      const rect = getRect(el);
      pickHighlight = document.createElement('div');
      pickHighlight.style.cssText = `position:fixed;left:${rect.left-2}px;top:${rect.top-2}px;width:${rect.width+4}px;height:${rect.height+4}px;border:3px solid #6366F1;border-radius:4px;pointer-events:none;z-index:2147483647;box-shadow:0 0 0 9999px rgba(0,0,0,0.3);`;
      document.body.appendChild(pickHighlight);
    }
    function onClick(e) {
      if (e.target === host || e.target === panel || e.target === pickHighlight) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      const target = e.composedPath()[0];
      finishPick(target);
    }
    function onKeyDown(e) { if (e.key === 'Escape') cancelPick(); }

    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);

    function finishPick(target) {
      document.removeEventListener('mouseover', onMouseOver, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKeyDown, true);
      host.remove(); panel.remove();
      if (pickHighlight) pickHighlight.remove();
      pickMode = null;
      if (role === 'input') {
        const inputEl = findInputFromTarget(target);
        if (!inputEl) { alert('No parece una caja de texto'); return; }
        const selector = buildSelectorWithShadow(inputEl);
        if (selector) saveProfile('input', selector, inputEl);
      } else {
        const submitEl = findSubmitFromTarget(target);
        if (!submitEl) { alert('No parece un botón'); return; }
        const selector = buildSelectorWithShadow(submitEl);
        if (selector) saveProfile('submit', selector, submitEl);
      }
    }
    function cancelPick() {
      document.removeEventListener('mouseover', onMouseOver, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKeyDown, true);
      host.remove(); panel.remove();
      if (pickHighlight) pickHighlight.remove();
      pickMode = null;
    }
    function findInputFromTarget(target) {
      let el = target;
      while (el && el !== document.body) {
        if (el.matches?.('textarea, input[type="text"], input:not([type]), [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"], [role="textbox"]')) return el;
        const found = el.querySelector?.('textarea, input[type="text"], input:not([type]), [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"], [role="textbox"]');
        if (found) return found;
        el = el.parentElement || (el.getRootNode?.()?.host);
      }
      return null;
    }
    function findSubmitFromTarget(target) {
      let el = target;
      while (el && el !== document.body) {
        if (el.matches?.('button, [role="button"], input[type="submit"], input[type="button"], a[role="button"]')) return el;
        el = el.parentElement || (el.getRootNode?.()?.host);
      }
      return target;
    }
    function saveProfile(type, selector, el) {
      const meta = {
        selector,
        tag: el.tagName,
        ariaLabel: el.getAttribute('aria-label'),
        placeholder: el.getAttribute('placeholder'),
        text: (el.value || el.textContent || '').slice(0, 30),
        frameUrl: location.href,
        savedAt: Date.now()
      };
      chrome.storage.local.get('siteProfiles', (data) => {
        const profiles = data.siteProfiles || {};
        const hostname = location.hostname;
        if (!profiles[hostname]) profiles[hostname] = {};
        profiles[hostname][type] = meta;
        profiles[hostname].frameUrl = location.href;
        chrome.storage.local.set({ siteProfiles: profiles });
      });
    }
  }

  // ===== EXPORT =====
  detect.findInputs = findInputs;
  detect.findSubmit = findSubmit;
  detect.setPromptText = setPromptText;
  detect.sendPrompt = sendPrompt;
  detect.snapshotMedia = snapshotMedia;
  detect.waitForResult = waitForResult;
  detect.highlight = highlight;
  detect.clearHighlights = clearHighlights;
  detect.testType = testType;
  detect.buildSelector = buildSelector;
  detect.buildSelectorWithShadow = buildSelectorWithShadow;
  detect.deepQuerySelectorAll = deepQuerySelectorAll;
  detect.startPick = startPick;
  detect.isVisible = isVisible;
  detect.getRect = getRect;

  window.__colaPromptsDetect = detect;
})();