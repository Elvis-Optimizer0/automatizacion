const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const { verifyBinaries } = require('./core/binaries');
const { validateProject, getDefaultConfig } = require('./core/config.schema');
const { buildTimeline } = require('./core/timeline');
const { renderVideo, renderPreview, getAudioDuration, renderAllOutputs, renderVideoForOutput, validateInputPaths } = require('./core/render');

let mainWindow = null;
let lastOutputDir = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 900,
    minHeight: 650,
    title: 'Video Maker FIX',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    verifyBinaries();
  } catch (err) {
    console.error('Error verificando binarios:', err.message);
  }

  const { app: electronApp } = require('electron');
  const settingsPath = path.join(electronApp.getPath('userData'), 'settings.json');
  try {
    const fs = require('fs');
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      lastOutputDir = settings.lastOutputDir;
    }
  } catch (e) {}

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'win32') app.quit();
});

ipcMain.handle('selectFiles', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections', ...(options.properties || [])],
    filters: options.filters || [
      { name: 'Imágenes y Video', extensions: ['png', 'jpg', 'jpeg', 'webp', 'mp4'] },
      { name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'aac'] },
      { name: 'Todos', extensions: ['*'] }
    ],
    title: options.title || 'Seleccionar archivos'
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('selectFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Seleccionar carpeta de destino',
    defaultPath: lastOutputDir || undefined
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('saveFileDialog', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: options.filters || [{ name: 'Video MP4', extensions: ['mp4'] }],
    defaultPath: options.defaultPath || 'video.mp4',
    title: options.title || 'Guardar video'
  });
  return result.canceled ? null : result.filePath;
});

ipcMain.handle('openFolder', async (event, folderPath) => {
  const { shell } = require('electron');
  await shell.openPath(folderPath);
});

ipcMain.handle('buildTimeline', async (event, project) => {
  try {
    console.log('[buildTimeline] images[0]=', JSON.stringify(project.images?.[0]), 'narration=', JSON.stringify(project.narration));
    const validated = validateProject(project);
    validateInputPaths(validated);
    const narrationPath = validated.narration?.path;
    if (!narrationPath || !path.isAbsolute(narrationPath)) {
      throw new Error(`E_INPUT_MISSING: Narración sin ruta absoluta válida`);
    }
    const audioDuration = await getAudioDuration(narrationPath);
    const timeline = buildTimeline(validated, audioDuration);

    if (timeline.durationDiff > 0.2) {
      throw new Error(`E_DURATION_MISMATCH: Duración final (${timeline.totalDuration.toFixed(2)}s) difiere del audio (${audioDuration.toFixed(2)}s) en más de 0.2s`);
    }

    return { success: true, timeline };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('renderVideo', async (event, project, timeline, fontPath, outputPath) => {
  try {
    const result = await renderVideo(project, timeline, fontPath, outputPath, (progress, current, total) => {
      event.sender.send('render-progress', { progress, current, total });
    });
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('renderAllOutputs', async (event, project, timeline, fontPath, outputDir) => {
  try {
    const result = await renderAllOutputs(project, timeline, fontPath, outputDir, (progress, current, total, currentOutput, totalOutputs, resolution) => {
      event.sender.send('render-progress', { progress, current, total, currentOutput, totalOutputs, resolution });
    });

    const { app: electronApp } = require('electron');
    const settingsPath = path.join(electronApp.getPath('userData'), 'settings.json');
    try {
      const fs = require('fs');
      fs.writeFileSync(settingsPath, JSON.stringify({ lastOutputDir: outputDir }, null, 2));
    } catch (e) {}

    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('renderPreview', async (event, project, timeline, fontPath, outputPath) => {
  try {
    const result = await renderPreview(project, timeline, fontPath, outputPath, (progress) => {
      event.sender.send('preview-progress', { progress });
    });
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('getAudioDuration', async (event, audioPath) => {
  try {
    const duration = await getAudioDuration(audioPath);
    return { success: true, duration };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('getDefaultConfig', () => {
  return getDefaultConfig();
});

ipcMain.handle('getFontPath', () => {
  return path.join(__dirname, 'assets', 'fonts', 'DejaVuSans-Bold.ttf');
});

ipcMain.handle('getLastOutputDir', () => {
  return lastOutputDir;
});

ipcMain.handle('stage-file', async (event, { name, buffer }) => {
  const fs = require('fs');
  const path = require('path');
  const { app } = require('electron');
  
  const safeName = name.replace(/[<>:"\/\\|?*]/g, '_');
  const tempDir = path.join(app.getPath('temp'), 'video-maker-inputs');
  
  try {
    await fs.promises.mkdir(tempDir, { recursive: true });
  } catch (e) {}
  
  const filePath = path.join(tempDir, `${Date.now()}_${safeName}`);
  await fs.promises.writeFile(filePath, Buffer.from(buffer));
  
  return filePath;
});
