import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

describe('renderer.js with real index.html (jsdom dangerous)', () => {
  let dom;
  let window;
  let document;
  let consoleErrors = [];

  beforeEach(() => {
    consoleErrors = [];
    const originalError = console.error;
    console.error = (...args) => {
      consoleErrors.push(args.join(' '));
      originalError.apply(console, args);
    };

    const html = fs.readFileSync(path.resolve('app/ui/index.html'), 'utf8');
    const rendererCode = fs.readFileSync(path.resolve('app/ui/renderer.js'), 'utf8');

    dom = new JSDOM(html, {
      runScripts: 'dangerously',
      resources: 'usable',
      pretendToBeVisual: true,
      beforeParse(window) {
        window.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
        window.URL.revokeObjectURL = vi.fn();
        window.navigator.clipboard = {
          readText: vi.fn().mockResolvedValue('')
        };
        window.Sortable = class Sortable {
          constructor(el, options) {
            this.el = el;
            this.options = options;
          }
          destroy() {}
        };
        window.api = {
          getRealPath: vi.fn().mockResolvedValue('C:\\mock\\path'),
          stageFile: vi.fn().mockResolvedValue('C:\\staged\\file'),
          getAudioDuration: vi.fn().mockResolvedValue({ success: true, duration: 10 }),
          renderPreview: vi.fn().mockResolvedValue({ success: true, outputPath: 'C:\\preview.mp4' }),
          renderVideo: vi.fn().mockResolvedValue({ success: true, outputPath: 'C:\\video.mp4' }),
          saveFileDialog: vi.fn().mockResolvedValue('C:\\output.mp4'),
          onPreviewProgress: vi.fn(() => vi.fn()),
          onRenderProgress: vi.fn(() => vi.fn()),
          getFontPath: vi.fn().mockResolvedValue('C:\\font.ttf'),
          getDefaultConfig: vi.fn().mockResolvedValue({}),
          getLastOutputDir: vi.fn().mockResolvedValue('C:\\'),
          openFolder: vi.fn()
        };
        window.addEventListener('error', (e) => {
          consoleErrors.push(e.message);
        });
        window.addEventListener('unhandledrejection', (e) => {
          consoleErrors.push(e.reason?.message || String(e.reason));
        });
      }
    });

    window = dom.window;
    document = window.document;
    global.window = window;
    global.document = document;
    Object.defineProperty(global, 'navigator', { value: window.navigator, writable: true, configurable: true });
    global.URL = window.URL;
    global.DataTransfer = window.DataTransfer;
    global.File = window.File;
    global.FileReader = window.FileReader;
    global.Blob = window.Blob;
    global.Sortable = window.Sortable;

    const script = document.createElement('script');
    script.textContent = rendererCode;
    document.head.appendChild(script);

    return new Promise(resolve => setTimeout(resolve, 2000));
  });

  afterEach(() => {
    if (dom) {
      dom.window.close();
    }
    delete global.window;
    delete global.document;
    delete global.navigator;
    delete global.URL;
    delete global.DataTransfer;
    delete global.File;
    delete global.FileReader;
    delete global.Blob;
    delete global.Sortable;
  });

  it('loads without uncaught errors', () => {
    const criticalErrors = consoleErrors.filter(e =>
      e.includes('ReferenceError') ||
      e.includes('TypeError') ||
      e.includes('grid is not defined') ||
      e.includes('window.api.send') ||
      e.includes('Cannot read properties of undefined')
    );
    expect(criticalErrors).toEqual([]);
  });

  it('has required DOM elements for drop zones', () => {
    expect(document.getElementById('images-dropzone')).toBeTruthy();
    expect(document.getElementById('images-input')).toBeTruthy();
    expect(document.getElementById('narration-dropzone')).toBeTruthy();
    expect(document.getElementById('narration-input')).toBeTruthy();
    expect(document.getElementById('music-dropzone')).toBeTruthy();
    expect(document.getElementById('music-input')).toBeTruthy();
  });

  it('has images-grid element for grid operations', () => {
    const grid = document.getElementById('images-grid');
    expect(grid).toBeTruthy();
  });

  it('drop zones have data-dropzone attribute', () => {
    expect(document.getElementById('images-dropzone').dataset.dropzone).toBe('images');
    expect(document.getElementById('narration-dropzone').dataset.dropzone).toBe('narration');
    expect(document.getElementById('music-dropzone').dataset.dropzone).toBe('music');
  });
});

describe('renderer.js import flow tests (getRealPath returns path)', () => {
  let dom;
  let window;
  let document;
  let consoleErrors = [];

  const setupDom = (apiMock) => {
    consoleErrors = [];
    const originalError = console.error;
    console.error = (...args) => {
      consoleErrors.push(args.join(' '));
      originalError.apply(console, args);
    };

    const html = fs.readFileSync(path.resolve('app/ui/index.html'), 'utf8');
    const rendererCode = fs.readFileSync(path.resolve('app/ui/renderer.js'), 'utf8');

    dom = new JSDOM(html, {
      runScripts: 'dangerously',
      resources: 'usable',
      pretendToBeVisual: true,
      beforeParse(window) {
        window.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
        window.URL.revokeObjectURL = vi.fn();
        window.navigator.clipboard = {
          readText: vi.fn().mockResolvedValue('')
        };
        window.Sortable = class Sortable {
          constructor(el, options) {
            this.el = el;
            this.options = options;
          }
          destroy() {}
        };
        window.api = apiMock;
        window.addEventListener('error', (e) => {
          consoleErrors.push(e.message);
        });
        window.addEventListener('unhandledrejection', (e) => {
          consoleErrors.push(e.reason?.message || String(e.reason));
        });
      }
    });

    window = dom.window;
    document = window.document;
    global.window = window;
    global.document = document;
    Object.defineProperty(global, 'navigator', { value: window.navigator, writable: true, configurable: true });
    global.URL = window.URL;
    global.DataTransfer = window.DataTransfer;
    global.File = window.File;
    global.FileReader = window.FileReader;
    global.Blob = window.Blob;
    global.Sortable = window.Sortable;

    const script = document.createElement('script');
    script.textContent = rendererCode;
    document.head.appendChild(script);

    return new Promise(resolve => setTimeout(resolve, 2000));
  };

  afterEach(() => {
    if (dom) {
      dom.window.close();
    }
    delete global.window;
    delete global.document;
    delete global.navigator;
    delete global.URL;
    delete global.DataTransfer;
    delete global.File;
    delete global.FileReader;
    delete global.Blob;
    delete global.Sortable;
  });

  const createMockFile = (name, type = 'image/jpeg') => {
    return new File(['mock content'], name, { type });
  };

  const triggerChange = (dropzoneId, files) => {
    const onFiles = window.dropzoneOnFiles?.[dropzoneId];
    if (onFiles) {
      return onFiles(files);
    }
    return Promise.resolve();
  };

  it('images-input change with getRealPath path adds image to state.images and shows thumbnail', async () => {
    const apiMock = {
      getRealPath: (file) => 'C:\\x\\escena1.jpg',
      stageFile: vi.fn().mockResolvedValue('C:\\staged\\file'),
      getAudioDuration: vi.fn().mockResolvedValue({ success: true, duration: 10 }),
    };

    await setupDom(apiMock);

    const file = createMockFile('escena1.jpg');
    await triggerChange('images-dropzone', [file]);

    await new Promise(r => setTimeout(r, 500));

    const grid = document.getElementById('images-grid');
    expect(grid.children.length).toBeGreaterThan(0);
    expect(grid.querySelector('.preview-item')).toBeTruthy();
    const criticalErrors = consoleErrors.filter(e =>
      e.includes('ReferenceError') || e.includes('TypeError') || e.includes('grid is not defined')
    );
    expect(criticalErrors).toEqual([]);
  });

  it('narration-input change with getRealPath path sets state.narration and updates UI', async () => {
    const apiMock = {
      getRealPath: (file) => 'C:\\x\\narracion.mp3',
      stageFile: vi.fn().mockResolvedValue('C:\\staged\\file'),
      getAudioDuration: vi.fn().mockResolvedValue({ success: true, duration: 10 }),
    };

    await setupDom(apiMock);

    const file = createMockFile('narracion.mp3', 'audio/mpeg');
    await triggerChange('narration-dropzone', [file]);

    await new Promise(r => setTimeout(r, 500));

    const info = document.getElementById('narration-info');
    expect(info.hidden).toBe(false);
    const nameEl = document.getElementById('narration-name');
    expect(nameEl.textContent).toBe('narracion.mp3');
    const criticalErrors = consoleErrors.filter(e =>
      e.includes('ReferenceError') || e.includes('TypeError')
    );
    expect(criticalErrors).toEqual([]);
  });

  it('music-input change with getRealPath path sets state.music and updates UI', async () => {
    const apiMock = {
      getRealPath: (file) => 'C:\\x\\musica.mp3',
      stageFile: vi.fn().mockResolvedValue('C:\\staged\\file'),
      getAudioDuration: vi.fn().mockResolvedValue({ success: true, duration: 10 }),
    };

    await setupDom(apiMock);

    const file = createMockFile('musica.mp3', 'audio/mpeg');
    await triggerChange('music-dropzone', [file]);

    await new Promise(r => setTimeout(r, 500));

    const info = document.getElementById('music-info');
    expect(info.hidden).toBe(false);
    const nameEl = document.getElementById('music-name');
    expect(nameEl.textContent).toBe('musica.mp3');
    const criticalErrors = consoleErrors.filter(e =>
      e.includes('ReferenceError') || e.includes('TypeError')
    );
    expect(criticalErrors).toEqual([]);
  });
});

describe('renderer.js import flow tests (getRealPath returns empty, stageFile used)', () => {
  let dom;
  let window;
  let document;
  let consoleErrors = [];

  const setupDom = (apiMock) => {
    consoleErrors = [];
    const originalError = console.error;
    console.error = (...args) => {
      consoleErrors.push(args.join(' '));
      originalError.apply(console, args);
    };

    const html = fs.readFileSync(path.resolve('app/ui/index.html'), 'utf8');
    const rendererCode = fs.readFileSync(path.resolve('app/ui/renderer.js'), 'utf8');

    dom = new JSDOM(html, {
      runScripts: 'dangerously',
      resources: 'usable',
      pretendToBeVisual: true,
      beforeParse(window) {
        window.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
        window.URL.revokeObjectURL = vi.fn();
        window.navigator.clipboard = {
          readText: vi.fn().mockResolvedValue('')
        };
        window.Sortable = class Sortable {
          constructor(el, options) {
            this.el = el;
            this.options = options;
          }
          destroy() {}
        };
        window.api = apiMock;
        window.addEventListener('error', (e) => {
          consoleErrors.push(e.message);
        });
        window.addEventListener('unhandledrejection', (e) => {
          consoleErrors.push(e.reason?.message || String(e.reason));
        });
      }
    });

    window = dom.window;
    document = window.document;
    global.window = window;
    global.document = document;
    Object.defineProperty(global, 'navigator', { value: window.navigator, writable: true, configurable: true });
    global.URL = window.URL;
    global.DataTransfer = window.DataTransfer;
    global.File = window.File;
    global.FileReader = window.FileReader;
    global.Blob = window.Blob;
    global.Sortable = window.Sortable;

    const script = document.createElement('script');
    script.textContent = rendererCode;
    document.head.appendChild(script);

    return new Promise(resolve => setTimeout(resolve, 2000));
  };

  afterEach(() => {
    if (dom) {
      dom.window.close();
    }
    delete global.window;
    delete global.document;
    delete global.navigator;
    delete global.URL;
    delete global.DataTransfer;
    delete global.File;
    delete global.FileReader;
    delete global.Blob;
    delete global.Sortable;
  });

  const createMockFile = (name, type = 'image/jpeg') => {
    return new File(['mock content'], name, { type });
  };

  const triggerChange = (dropzoneId, files) => {
    const onFiles = window.dropzoneOnFiles?.[dropzoneId];
    if (onFiles) {
      return onFiles(files);
    }
    return Promise.resolve();
  };

  it('images-input change with empty getRealPath uses stageFile and adds image', async () => {
    const stageFileMock = vi.fn().mockResolvedValue('C:\\staged\\escena1.jpg');
    const apiMock = {
      getRealPath: (file) => '',
      stageFile: stageFileMock,
      getAudioDuration: vi.fn().mockResolvedValue({ success: true, duration: 10 }),
    };

    await setupDom(apiMock);

    const file = createMockFile('escena1.jpg');
    await triggerChange('images-dropzone', [file]);

    await new Promise(r => setTimeout(r, 500));

    expect(stageFileMock).toHaveBeenCalled();
    const grid = document.getElementById('images-grid');
    expect(grid.children.length).toBeGreaterThan(0);
    expect(grid.querySelector('.preview-item')).toBeTruthy();
    const criticalErrors = consoleErrors.filter(e =>
      e.includes('ReferenceError') || e.includes('TypeError') || e.includes('grid is not defined')
    );
    expect(criticalErrors).toEqual([]);
  });

  it('narration-input change with empty getRealPath uses stageFile and sets narration', async () => {
    const stageFileMock = vi.fn().mockResolvedValue('C:\\staged\\narracion.mp3');
    const apiMock = {
      getRealPath: (file) => '',
      stageFile: stageFileMock,
      getAudioDuration: vi.fn().mockResolvedValue({ success: true, duration: 10 }),
    };

    await setupDom(apiMock);

    const file = createMockFile('narracion.mp3', 'audio/mpeg');
    await triggerChange('narration-dropzone', [file]);

    await new Promise(r => setTimeout(r, 500));

    expect(stageFileMock).toHaveBeenCalled();
    const info = document.getElementById('narration-info');
    expect(info.hidden).toBe(false);
    const nameEl = document.getElementById('narration-name');
    expect(nameEl.textContent).toBe('narracion.mp3');
    const criticalErrors = consoleErrors.filter(e =>
      e.includes('ReferenceError') || e.includes('TypeError')
    );
    expect(criticalErrors).toEqual([]);
  });

  it('music-input change with empty getRealPath uses stageFile and sets music', async () => {
    const stageFileMock = vi.fn().mockResolvedValue('C:\\staged\\musica.mp3');
    const apiMock = {
      getRealPath: (file) => '',
      stageFile: stageFileMock,
      getAudioDuration: vi.fn().mockResolvedValue({ success: true, duration: 10 }),
    };

    await setupDom(apiMock);

    const file = createMockFile('musica.mp3', 'audio/mpeg');
    await triggerChange('music-dropzone', [file]);

    await new Promise(r => setTimeout(r, 500));

    expect(stageFileMock).toHaveBeenCalled();
    const info = document.getElementById('music-info');
    expect(info.hidden).toBe(false);
    const nameEl = document.getElementById('music-name');
    expect(nameEl.textContent).toBe('musica.mp3');
    const criticalErrors = consoleErrors.filter(e =>
      e.includes('ReferenceError') || e.includes('TypeError')
    );
    expect(criticalErrors).toEqual([]);
  });
});