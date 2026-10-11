const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectFiles: (options) => ipcRenderer.invoke('selectFiles', options),
  selectFolder: () => ipcRenderer.invoke('selectFolder'),
  saveFileDialog: (options) => ipcRenderer.invoke('saveFileDialog', options),
  openFolder: (folderPath) => ipcRenderer.invoke('openFolder', folderPath),
  buildTimeline: (project) => ipcRenderer.invoke('buildTimeline', project),
  renderVideo: (project, timeline, fontPath, outputPath) => ipcRenderer.invoke('renderVideo', project, timeline, fontPath, outputPath),
  renderAllOutputs: (project, timeline, fontPath, outputDir) => ipcRenderer.invoke('renderAllOutputs', project, timeline, fontPath, outputDir),
  renderPreview: (project, timeline, fontPath, outputPath) => ipcRenderer.invoke('renderPreview', project, timeline, fontPath, outputPath),
  getAudioDuration: (audioPath) => ipcRenderer.invoke('getAudioDuration', audioPath),
  getDefaultConfig: () => ipcRenderer.invoke('getDefaultConfig'),
  getFontPath: () => ipcRenderer.invoke('getFontPath'),
  getLastOutputDir: () => ipcRenderer.invoke('getLastOutputDir'),
  getRealPath: (file) => webUtils.getPathForFile(file),
  onRenderProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('render-progress', handler);
    return () => ipcRenderer.off('render-progress', handler);
  },
  onPreviewProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('preview-progress', handler);
    return () => ipcRenderer.off('preview-progress', handler);
  }
});