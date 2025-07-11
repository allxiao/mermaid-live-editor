// main.cjs
const { app, BrowserWindow, ipcMain, dialog, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');

const scheme = 'mermaid-desktop';

// --- IMPORTANT STEP ---
// 1. Register the scheme as privileged before the app is ready.
// This is the key to fixing both the fetch and localStorage errors.
protocol.registerSchemesAsPrivileged([
  {
    scheme: scheme,
    privileges: {
      standard: true,         // Treat it like a standard protocol
      secure: true,           // Treat it as a secure protocol (HTTPS-like)
      supportFetchAPI: true,  // Explicitly enable fetch()
      corsEnabled: true,      // Allow Cross-Origin Resource Sharing
    },
  },
]);

function registerProtocol() {
  const docsRoot = path.join(app.getAppPath(), 'docs');

  protocol.handle(scheme, async (request) => {
    // 1. Create a URL object from the requested URL
    const url = new URL(request.url);

    // 2. Get the path part, e.g., for "app://index.html", pathname is "/index.html"
    // And decode it to handle spaces or special characters, e.g., %20 -> space
    const requestedPath = decodeURI(url.pathname);

    // 3. Construct the absolute path to the file inside your 'docs' directory
    let filePath = path.join(docsRoot, requestedPath);

    console.log("url", url, "requestedPath", requestedPath, "filePath", filePath);

    // 4. IMPORTANT SECURITY STEP:
    //    Ensure the resolved path is still inside your app's 'docs' folder.
    //    This prevents path traversal attacks (e.g., "app://../../windows/system32").
    if (!filePath.startsWith(docsRoot)) {
      console.error(`[Security] Blocked request for an invalid path: ${filePath}`);
      return new Response('Invalid path', { status: 400 }); // Bad Request
    }

    try {
      // Check if the path exists and if it's a directory
      const stats = await fs.promises.stat(filePath).catch(() => {
        // If stat fails, the path likely doesn't exist.
        // We'll let the fetch below handle the 404.
      });

      if (stats && stats.isDirectory()) {
        // If it's a directory, look for default files
        const defaultFiles = ['index.html', 'index.htm'];
        let found = false;
        for (const defaultFile of defaultFiles) {
          const defaultFilePath = path.join(filePath, defaultFile);
          try {
            // Check if the default file exists
            await fs.promises.access(defaultFilePath);
            filePath = defaultFilePath; // If it exists, update the filePath
            found = true;
            break;
          } catch (e) {
            // This default file doesn't exist, try the next one
          }
        }

        if (!found) {
          // If no default file is found in the directory
          return new Response('Not Found', { status: 404 });
        }
      }

      // 5. Use Electron's `net.fetch` to create a Response object from the file path.
      const response = await net.fetch(`file://${filePath}`);
      return response;
    } catch (e) {
      console.error(`Failed to serve file: ${filePath}`, e);
      // Return a 404 response if the file doesn't exist
      return new Response('Not Found', { status: 404 });
    }
  });
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      // Preload script is crucial for secure communication between main and renderer
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  if (app.isPackaged) {
    // In production, load the static HTML file that was built
    // The path is relative to the CJS-style __dirname
    mainWindow.loadURL(`${scheme}://index.html`);
  } else {
    // In development, load from the Vite dev server
    mainWindow.loadURL('http://localhost:3000/');
  }
}

app.whenReady().then(() => {
  registerProtocol();

  createWindow();
});

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
