const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectFiles: (options) => ipcRenderer.invoke('selectFiles', options),
  saveFileDialog: (options) => ipcRenderer.invoke('saveFileDialog', options),
  openFolder: (folderPath) => ipcRenderer.invoke('openFolder', folderPath),
  buildTimeline: (project) => ipcRenderer.invoke('buildTimeline', project),
  renderVideo: (project, timeline, fontPath, outputPath) => ipcRenderer.invoke('renderVideo', project, timeline, fontPath, outputPath),
  renderPreview: (project, timeline, fontPath, outputPath) => ipcRenderer.invoke('renderPreview', project, timeline, fontPath, outputPath),
  getAudioDuration: (audioPath) => ipcRenderer.invoke('getAudioDuration', audioPath),
  getDefaultConfig: () => ipcRenderer.invoke('getDefaultConfig'),
  getFontPath: () => ipcRenderer.invoke('getFontPath'),
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