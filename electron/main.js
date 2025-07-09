// main.js
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      // Preload script is crucial for secure communication between main and renderer
      preload: path.join(path.dirname(fileURLToPath(import.meta.url)), 'preload.js')
    }
  });

  // For your project, you would point this to the index.html of the Mermaid Live Editor
  // For now, let's just load a local file.
  mainWindow.loadURL('http://localhost:3000/');
}

app.whenReady().then(createWindow);

// This is where you handle the "save to file" logic
ipcMain.handle('save-file', async (event, { content, format }) => {
  const { filePath } = await dialog.showSaveDialog({
    title: 'Save Diagram',
    buttonLabel: 'Save',
    filters: [
      format === 'svg'
        ? { name: 'SVG Images', extensions: ['svg'] }
        : { name: 'PNG Images', extensions: ['png'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (filePath) {
    try {
      if (format === 'png') {
        // Saving a PNG requires converting from base64
        const data = content.replace(/^data:image\/png;base64,/, '');
        fs.writeFileSync(filePath, data, 'base64');
      } else {
        // SVG is just text
        fs.writeFileSync(filePath, content, 'utf-8');
      }
      return { success: true, path: filePath };
    } catch (error) {
      console.error('Failed to save the file:', error);
      return { success: false, error: error.message };
    }
  }
  return { success: false }; // User cancelled the dialog
});
