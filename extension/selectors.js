function getUniqueSelector(element) {
  if (!element) return null;

  if (element.id && !element.id.startsWith(':')) {
    const sel = `#${CSS.escape(element.id)}`;
    if (document.querySelectorAll(sel).length === 1) return sel;
  }

  const attributes = ['data-testid', 'data-id', 'data-cy', 'aria-label', 'role', 'placeholder', 'name', 'type'];
  for (const attr of attributes) {
    const val = element.getAttribute(attr);
    if (val) {
      const sel = `${element.tagName.toLowerCase()}[${attr}="${CSS.escape(val)}"]`;
      if (document.querySelectorAll(sel).length === 1) return sel;
    }
  }

  const classes = Array.from(element.classList).filter(c => !c.startsWith('_') && !/^\d/.test(c) && c.length > 2);
  for (const cls of classes) {
    const sel = `${element.tagName.toLowerCase()}.${CSS.escape(cls)}`;
    if (document.querySelectorAll(sel).length === 1) return sel;
  }

  let current = element;
  let path = [];
  let depth = 0;

  while (current && current !== document.body && depth < 4) {
    const parent = current.parentElement;
    if (!parent) break;

    const siblings = Array.from(parent.children).filter(el => el.tagName === current.tagName);
    const index = siblings.indexOf(current) + 1;

    let selector = current.tagName.toLowerCase();
    if (siblings.length > 1) {
      selector += `:nth-of-type(${index})`;
    }

    if (current.id && !current.id.startsWith(':')) {
      selector = `#${CSS.escape(current.id)}`;
      path.unshift(selector);
      break;
    }

    path.unshift(selector);
    current = parent;
    depth++;
  }

  const sel = path.join(' > ');
  if (document.querySelectorAll(sel).length === 1) return sel;

  return null;
}

function getGenericImageSelector(element) {
  if (!element) return null;

  let current = element;
  let depth = 0;

  while (current && current !== document.body && depth < 5) {
    const classes = Array.from(current.classList).filter(c => !c.startsWith('_') && c.length > 2);
    for (const cls of classes) {
      const sel = `.${CSS.escape(cls)}`;
      const matches = document.querySelectorAll(sel);
      if (matches.length >= 2) {
        const allImages = Array.from(matches).every(el => el.tagName === 'IMG' || el.tagName === 'VIDEO' || el.querySelector('img, video'));
        if (allImages) return sel;
      }
    }

    if (current.tagName === 'IMG' || current.tagName === 'VIDEO') {
      const parent = current.parentElement;
      if (parent) {
        const parentClasses = Array.from(parent.classList).filter(c => !c.startsWith('_') && c.length > 2);
        for (const cls of parentClasses) {
          const sel = `.${CSS.escape(cls)} > img, .${CSS.escape(cls)} > video`;
          const matches = document.querySelectorAll(sel);
          if (matches.length >= 2) return sel;
        }
      }
    }

    current = current.parentElement;
    depth++;
  }

  return 'img, video';
}

function setPromptText(element, text) {
  return new Promise((resolve, reject) => {
    const proto = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype :
                  element.tagName === 'INPUT' ? HTMLInputElement.prototype : null;

    const doSet = () => {
      try {
        element.focus();

        if (proto) {
          const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
          setter.call(element, text);
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (element.isContentEditable) {
          element.focus();
          document.execCommand('selectAll', false, null);
          document.execCommand('insertText', false, text);
          element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
        } else {
          element.textContent = text;
          element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
        }

        setTimeout(() => {
          const currentValue = proto ? element.value : element.textContent;
          if (currentValue.includes(text.substring(0, Math.min(20, text.length)))) {
            resolve(true);
          } else {
            doSet();
          }
        }, 400);
      } catch (e) {
        reject(e);
      }
    };

    doSet();
  });
}

function clickSubmit(element) {
  return new Promise((resolve, reject) => {
    const tryClick = async () => {
      for (let i = 0; i < 25; i++) {
        if (!element.disabled && element.getAttribute('aria-disabled') !== 'true') {
          element.click();
          resolve(true);
          return;
        }
        await new Promise(r => setTimeout(r, 200));
      }
      element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      element.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', bubbles: true }));
      element.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
      resolve(true);
    };
    tryClick();
  });
}

function waitForGenerationDone(selector, beforeCount, imagesPerPrompt, timeoutMs, busySelector) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let stableCount = 0;
    let lastCount = -1;

    const checkDone = () => {
      const elements = document.querySelectorAll(selector);
      const count = elements.length;

      const newImages = count - beforeCount;
      const hasNewImages = newImages >= imagesPerPrompt;

      let lastImageReady = false;
      if (hasNewImages && elements.length > 0) {
        const lastImg = elements[elements.length - 1];
        lastImageReady = lastImg.complete && lastImg.naturalWidth > 0;
      }

      const busyGone = !busySelector || !document.querySelector(busySelector);

      const errorElements = document.querySelectorAll('[role="alert"], [role="status"], .toast, .error, [class*="error" i]');
      for (const el of errorElements) {
        const text = el.textContent || '';
        if (/(error|l[ií]mite|limit|quota|try again|intenta de nuevo|no se pudo)/i.test(text)) {
          reject(new Error(`FLOW_ERROR: ${text.trim()}`));
          return;
        }
      }

      if (hasNewImages && lastImageReady && busyGone) {
        if (count === lastCount) {
          stableCount++;
          if (stableCount >= 3) {
            resolve(true);
            return;
          }
        } else {
          stableCount = 0;
          lastCount = count;
        }
      }

      if (Date.now() - startTime > timeoutMs) {
        reject(new Error('TIMEOUT'));
        return;
      }

      setTimeout(checkDone, 500);
    };

    const observer = new MutationObserver(checkDone);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });

    const interval = setInterval(checkDone, 500);

    checkDone();

    const originalResolve = resolve;
    resolve = (val) => {
      observer.disconnect();
      clearInterval(interval);
      originalResolve(val);
    };
    const originalReject = reject;
    reject = (err) => {
      observer.disconnect();
      clearInterval(interval);
      originalReject(err);
    };
  });
}

if (typeof module !== 'undefined') {
  module.exports = { getUniqueSelector, getGenericImageSelector, setPromptText, clickSubmit, waitForGenerationDone };
}