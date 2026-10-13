const fs = require('fs');

describe('IPC channel validation', () => {
  const mainContent = fs.readFileSync('app/main.js', 'utf8');
  const preloadContent = fs.readFileSync('app/preload.js', 'utf8');

  it('no duplicate ipcMain.handle channels in main.js', () => {
    const handlers = {};
    const lines = fs.readFileSync('app/main.js', 'utf8').split('\n');
    lines.forEach((line, i) => {
      const match = line.match(/ipcMain\.handle\(['"]([^'"]+)['"]/);
      if (match) {
        const channel = match[1];
        if (handlers[channel]) {
          handlers[channel].push(i + 1);
        } else {
          handlers[channel] = [i + 1];
        }
      }
    });
    const duplicates = Object.entries(handlers).filter(([_, lines]) => lines.length > 1);
    expect(duplicates).toEqual([]);
  });

  it('every preload invoke has a matching main handler', () => {
    const mainHandlers = new Set();
    fs.readFileSync('app/main.js', 'utf8').split('\n').forEach(line => {
      const match = line.match(/ipcMain\.handle\(['"]([^'"]+)['"]/);
      if (match) mainHandlers.add(match[1]);
    });

    const preloadInvokes = new Set();
    fs.readFileSync('app/preload.js', 'utf8').split('\n').forEach(line => {
      const match = line.match(/ipcRenderer\.invoke\(['"]([^'"]+)['"]/);
      if (match) preloadInvokes.add(match[1]);
    });

    preloadInvokes.forEach(channel => {
      expect(mainHandlers.has(channel)).toBe(true);
    });
  });

  it('no orphaned handlers in main without preload invoke', () => {
    const mainHandlers = new Set();
    fs.readFileSync('app/main.js', 'utf8').split('\n').forEach(line => {
      const match = line.match(/ipcMain\.handle\(['"]([^'"]+)['"]/);
      if (match) mainHandlers.add(match[1]);
    });

    const preloadInvokes = new Set();
    fs.readFileSync('app/preload.js', 'utf8').split('\n').forEach(line => {
      const match = line.match(/ipcRenderer\.invoke\(['"]([^'"]+)['"]/);
      if (match) preloadInvokes.add(match[1]);
    });

    mainHandlers.forEach(channel => {
      expect(preloadInvokes.has(channel)).toBe(true);
    });
  });
});