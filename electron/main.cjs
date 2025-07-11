// main.cjs
const { app, BrowserWindow, ipcMain, dialog, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');

const SCHEME = 'mermaid-desktop';

// --- IMPORTANT STEP ---
// 1. Register the scheme as privileged before the app is ready.
// This is the key to fixing both the fetch and localStorage errors.
protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: {
      standard: true,         // Treat it like a standard protocol
      secure: true,           // Treat it as a secure protocol (HTTPS-like)
      supportFetchAPI: true,  // Explicitly enable fetch()
      corsEnabled: true,      // Allow Cross-Origin Resource Sharing
    },
  },
]);

function registerProtocol() {
  const docsRoot = path.join(process.resourcesPath, 'docs');

  protocol.handle(SCHEME, async (request) => {
    console.debug("request url", request.url);

    // 1. Create a URL object from the requested URL
    const url = new URL(request.url);

    // 2. Get the path part, e.g., for "app://index.html", pathname is "/index.html"
    // And decode it to handle spaces or special characters, e.g., %20 -> space
    const requestedPath = decodeURI(url.pathname);

    // 3. Construct the absolute path to the file inside your 'docs' directory
    let filePath = path.join(docsRoot, requestedPath);

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
    title: 'Mermaid Live Editor',
    webPreferences: {
      // Preload script is crucial for secure communication between main and renderer
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  // Store the main window reference globally so we can access it from IPC handlers
  global.mainWindow = mainWindow;

  function redirectToInternalUrl(requestedUrl) {
    const prefix = app.isPackaged
      ? `${SCHEME}://`
      : `http://localhost:3000`;

    const newUrl = `${prefix}${requestedUrl.pathname}${requestedUrl.search}${requestedUrl.hash}`;
    console.log(`Redirecting to internal URL: ${newUrl}`);
    mainWindow.loadURL(newUrl);
  }

  // 1. Handle navigations within the current window
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const requestedUrl = new URL(navigationUrl);

    // Check if the navigation is to the target website
    if (requestedUrl.hostname === 'mermaid.live') {
      console.log(`Intercepted navigation to: ${requestedUrl.href}`);

      // Stop the original navigation
      event.preventDefault();

      redirectToInternalUrl(requestedUrl);
    }
    // If it's not a mermaid.live link, let it proceed (or add other logic)
  });

  // 2. Handle requests to open a new window (e.g., target="_blank")
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const requestedUrl = new URL(url);

    // Check if the link is to the target website
    if (requestedUrl.hostname === 'mermaid.live') {
      console.log(`Intercepted new window for: ${requestedUrl.href}`);

      // Redirect it in the main window
      redirectToInternalUrl(requestedUrl);

      // Deny creating a new Electron window
      return { action: 'deny' };
    }

    // For all other links (e.g., to GitHub, documentation), open them in the user's default browser.
    console.log(`Opening external link in browser: ${url}`);
    shell.openExternal(url);

    // Deny creating a new Electron window
    return { action: 'deny' };
  });

  if (app.isPackaged) {
    // In production, load the static HTML file that was built
    // The path is relative to the CJS-style __dirname
    mainWindow.loadURL(`${SCHEME}://index.html`);
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
ipcMain.handle('save-file', async (event, { content, format, defaultPath, skipDialog }) => {
  let filePath = defaultPath;

  // Only show the save dialog if skipDialog is not true
  if (!skipDialog) {
    const result = await dialog.showSaveDialog({
      title: 'Save Diagram',
      buttonLabel: 'Save',
      defaultPath,
      filters: [
        format === 'svg'
          ? { name: 'SVG Images', extensions: ['svg'] }
          : format === 'png'
            ? { name: 'PNG Images', extensions: ['png'] }
            : format === 'json'
              ? { name: 'JSON Files', extensions: ['json'] }
              : { name: 'All Files', extensions: ['*'] }
      ]
    });
    filePath = result.filePath;
  }

  if (filePath) {
    try {
      if (format === 'png') {
        // Saving a PNG requires converting from base64
        const data = content.replace(/^data:image\/png;base64,/, '');
        fs.writeFileSync(filePath, data, 'base64');
      } else {
        // SVG and JSON are just text
        fs.writeFileSync(filePath, content, 'utf-8');
      }
      return { success: true, path: filePath };
    } catch (error) {
      console.error('Failed to save the file:', error);
      return { success: false, error: error.message };
    }
  }
  return { success: false }; // User cancelled the dialog or no path
});

// Handler for opening JSON files
ipcMain.handle('open-file', async (event) => {
  const { filePaths } = await dialog.showOpenDialog({
    title: 'Open History File',
    buttonLabel: 'Open',
    filters: [
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  });

  if (filePaths && filePaths.length > 0) {
    try {
      const filePath = filePaths[0];
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      let jsonData;
      try {
        jsonData = JSON.parse(fileContent);
        // Ensure the data has the expected structure for a State object
        if (!jsonData.code) {
          console.error('Invalid state format: Missing required fields');
          return { success: false, error: 'Invalid state format: Missing required fields' };
        }
      } catch (parseError) {
        console.error('Failed to parse JSON:', parseError);
        return { success: false, error: 'Invalid JSON file format' };
      }
      return { success: true, path: filePath, data: jsonData };
    } catch (error) {
      console.error('Failed to read the file:', error);
      return { success: false, error: error.message };
    }
  }
  return { success: false }; // User cancelled the dialog
});

// Handler for setting the window title
ipcMain.handle('set-window-title', async (event, title) => {
  if (global.mainWindow) {
    const baseTitle = 'Mermaid Live Editor';
    global.mainWindow.setTitle(title ? `${title} - ${baseTitle}` : baseTitle);
    return { success: true };
  }
  return { success: false, error: 'Main window not available' };
});
