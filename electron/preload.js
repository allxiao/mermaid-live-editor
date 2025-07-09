// preload.js
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Expose a function that the frontend can call
  saveFile: (data) => ipcRenderer.invoke('save-file', data)
});
