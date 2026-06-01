const { app, BrowserWindow, ipcMain, Menu, Tray, shell, clipboard } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { exec } = require('child_process');
const sqlite3 = require('sqlite3').verbose();

let mainWindow;
let tray;

// Resolve SQLite Database path: ~/.kb/kb.db
const dbPath = path.join(os.homedir(), '.kb', 'kb.db');
const db = new sqlite3.Database(dbPath);

// Resolve package root for spawning Python CLI subprocesses
const projectRoot = path.resolve(__dirname, '..');

// Settings management (stored at ~/.kb/configs/kb-rss.json)
const configDir = path.join(os.homedir(), '.kb', 'configs');
const configPath = path.join(configDir, 'kb-rss.json');

function loadSettings() {
  const defaults = {
    ollama_host: process.env.OLLAMA_HOST || '192.168.0.25:11434',
    ollama_model: process.env.OLLAMA_MODEL || 'gemma4',
    gotify_url: process.env.GOTIFY_URL || '',
    gotify_token: process.env.GOTIFY_TOKEN || '',
    kb_web_url: process.env.KB_WEB_URL || 'http://localhost:8050',
    kb_web_api_key: process.env.KB_API_KEY || 'kb-secret-key'
  };
  try {
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return { ...defaults, ...data };
    }
  } catch (e) {
    console.error('Error reading settings file:', e);
  }
  return defaults;
}

function saveSettings(settings) {
  try {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(settings, null, 2), 'utf8');
    return { status: 'success' };
  } catch (e) {
    console.error('Error writing settings file:', e);
    throw e;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    },
    // Earth-toned initial background
    backgroundColor: '#F4EFEA',
    title: 'kb-rss',
    icon: path.join(__dirname, 'build', 'icon.png')
  });

  // Strip security headers to allow iframes for UAT browser preview
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders };
    delete responseHeaders['x-frame-options'];
    delete responseHeaders['X-Frame-Options'];
    delete responseHeaders['content-security-policy'];
    delete responseHeaders['Content-Security-Policy'];
    callback({ cancel: false, responseHeaders });
  });

  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist-frontend', 'index.html'));
  }

  // Intercept close event to hide window instead of quitting
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  // Use a fallback built-in icon or generic name (we'll check for a dummy file or create a standard color block)
  // To avoid packaging crash if icon doesn't exist, we create a simple 16x16 dummy image or use standard platform methods.
  // We will assume a simple blank tray or look for a icon file if user adds one later.
  let trayIconPath = path.join(__dirname, 'tray-icon.png');
  if (!fs.existsSync(trayIconPath)) {
    // Generate a simple colored tray placeholder to avoid crashing
    // For now we pass a dummy or require a small icon
    trayIconPath = path.join(projectRoot, 'src', 'kb_rss', '__init__.py'); // Use any file as fallback, or blank
  }
  
  try {
    // On Windows/Linux we can create a blank icon or pass standard icon path
    // We'll catch and print errors if any issues loading tray icon
    tray = new Tray(fs.existsSync(path.join(__dirname, 'tray-icon.png')) ? path.join(__dirname, 'tray-icon.png') : path.join(__dirname, 'package.json'));
    tray.setToolTip('kb-rss feed manager');
    
    tray.on('double-click', () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });

    updateTrayMenu();
  } catch (e) {
    console.error('Failed to create tray icon:', e);
  }
}

function updateTrayMenu() {
  if (!tray) return;

  db.all('SELECT id, title, link FROM rss_feed_entries ORDER BY rowid DESC LIMIT 5', (err, rows) => {
    const menuTemplate = [
      {
        label: 'Open Curation App',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        }
      },
      { type: 'separator' }
    ];

    if (rows && rows.length > 0) {
      menuTemplate.push({ label: 'Recent Articles:', enabled: false });
      rows.forEach((row) => {
        menuTemplate.push({
          label: row.title.length > 40 ? row.title.substring(0, 37) + '...' : row.title,
          click: () => {
            // Open link natively and track click
            shell.openExternal(row.link);
            db.run('UPDATE rss_feed_entries SET clicked = clicked + 1 WHERE id = ?', [row.id]);
          }
        });
      });
      menuTemplate.push({ type: 'separator' });
    }

    menuTemplate.push({
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    });

    const contextMenu = Menu.buildFromTemplate(menuTemplate);
    tray.setContextMenu(contextMenu);
  });
}

// Periodically update tray menu every 5 minutes to fetch new articles
setInterval(updateTrayMenu, 5 * 60 * 1000);

app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    db.close();
    app.quit();
  }
});

// --- IPC Handlers ---

// 1. Get entries with pagination & filters
ipcMain.handle('get-entries', async (event, args) => {
  const { limit = 20, offset = 0, categoryId, search, status, feedId } = args || {};
  let sql = `
    SELECT e.*, f.title as feed_title, f.feed_url
    FROM rss_feed_entries e
    JOIN rss_feeds f ON e.feed_id = f.id
    WHERE 1=1
  `;
  const params = [];

  if (categoryId) {
    sql += " AND e.feed_id IN (SELECT feed_id FROM rss_feed_categories WHERE category_id = ?)";
    params.push(categoryId);
  }
  if (feedId) {
    sql += " AND e.feed_id = ?";
    params.push(feedId);
  }
  if (search) {
    sql += " AND (e.title LIKE ? OR e.summary LIKE ?)";
    params.push(`%${search}%`, `%${search}%`);
  }
  if (status === 'liked') {
    sql += " AND e.liked = 1";
  } else if (status === 'disliked') {
    sql += " AND e.liked = -1";
  } else if (status === 'favorite') {
    sql += " AND e.favorite = 1";
  } else if (status === 'suggested') {
    sql += " AND e.taste_suggested = 1";
  }

  sql += " ORDER BY e.rowid DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
});

// 1b. Get single entry by ID
ipcMain.handle('get-entry', async (event, entryId) => {
  return new Promise((resolve, reject) => {
    db.get(`
      SELECT e.*, f.title as feed_title, f.feed_url
      FROM rss_feed_entries e
      JOIN rss_feeds f ON e.feed_id = f.id
      WHERE e.id = ?
    `, [entryId], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
});

// 1c. Save raw HTML exported from webview
ipcMain.handle('save-raw-html', async (event, { entryId, html }) => {
  return new Promise((resolve, reject) => {
    db.run("UPDATE rss_feed_entries SET full_content = ? WHERE id = ?", [html, entryId], (err) => {
      if (err) reject(err);
      else resolve({ status: 'success' });
    });
  });
});

// 2. Interaction state updates
ipcMain.handle('set-like-status', async (event, { entryId, liked }) => {
  return new Promise((resolve, reject) => {
    db.run("UPDATE rss_feed_entries SET liked = ? WHERE id = ?", [liked, entryId], (err) => {
      if (err) reject(err);
      else {
        updateTrayMenu();
        resolve({ status: 'success' });
      }
    });
  });
});

ipcMain.handle('toggle-favorite', async (event, entryId) => {
  return new Promise((resolve, reject) => {
    db.run("UPDATE rss_feed_entries SET favorite = 1 - favorite WHERE id = ?", [entryId], (err) => {
      if (err) reject(err);
      else resolve({ status: 'success' });
    });
  });
});

ipcMain.handle('save-comment', async (event, { entryId, comment }) => {
  return new Promise((resolve, reject) => {
    db.run("UPDATE rss_feed_entries SET comment = ? WHERE id = ?", [comment, entryId], (err) => {
      if (err) reject(err);
      else resolve({ status: 'success' });
    });
  });
});

ipcMain.handle('track-click', async (event, entryId) => {
  return new Promise((resolve, reject) => {
    db.run("UPDATE rss_feed_entries SET clicked = clicked + 1 WHERE id = ?", [entryId], (err) => {
      if (err) reject(err);
      else resolve({ status: 'success' });
    });
  });
});

ipcMain.handle('track-share', async (event, entryId) => {
  return new Promise((resolve, reject) => {
    db.run("UPDATE rss_feed_entries SET shared = shared + 1 WHERE id = ?", [entryId], (err) => {
      if (err) reject(err);
      else resolve({ status: 'success' });
    });
  });
});

// 3. Metadata queries
ipcMain.handle('get-feeds', async () => {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT f.*, group_concat(c.name, ', ') as categories_str
      FROM rss_feeds f
      LEFT JOIN rss_feed_categories fc ON f.id = fc.feed_id
      LEFT JOIN rss_categories c ON fc.category_id = c.id
      GROUP BY f.id
    `, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
});

ipcMain.handle('get-categories', async () => {
  return new Promise((resolve, reject) => {
    db.all("SELECT * FROM rss_categories ORDER BY name ASC", (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
});

// 4. Taste files profile queries
ipcMain.handle('get-interests-profile', async () => {
  const userInterestsPath = path.join(os.homedir(), '.kb', 'user_interests.md');
  const agentTastesPath = path.join(os.homedir(), '.kb', 'agent_user_tastes.md');
  
  let userInterests = '';
  let agentTastes = '';
  
  if (fs.existsSync(userInterestsPath)) {
    userInterests = fs.readFileSync(userInterestsPath, 'utf8');
  } else {
    // Generate default template
    userInterests = "# User Interests\n\nDefine your interests and priorities here...";
    if (!fs.existsSync(path.join(os.homedir(), '.kb'))) {
      fs.mkdirSync(path.join(os.homedir(), '.kb'), { recursive: true });
    }
    fs.writeFileSync(userInterestsPath, userInterests, 'utf8');
  }

  if (fs.existsSync(agentTastesPath)) {
    agentTastes = fs.readFileSync(agentTastesPath, 'utf8');
  }

  return { userInterests, agentTastes };
});

ipcMain.handle('save-interests-profile', async (event, content) => {
  const userInterestsPath = path.join(os.homedir(), '.kb', 'user_interests.md');
  try {
    if (!fs.existsSync(path.join(os.homedir(), '.kb'))) {
      fs.mkdirSync(path.join(os.homedir(), '.kb'), { recursive: true });
    }
    fs.writeFileSync(userInterestsPath, content, 'utf8');
    return { status: 'success' };
  } catch (e) {
    console.error('Failed to save interests file:', e);
    throw e;
  }
});

// 5. Daily Suggestions Curation Reports
ipcMain.handle('get-daily-reports', async () => {
  return new Promise((resolve, reject) => {
    db.all("SELECT * FROM rss_daily_reports ORDER BY date DESC", (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
});

ipcMain.handle('get-daily-report-details', async (event, date) => {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM rss_daily_reports WHERE date = ?", [date], (err, reportRow) => {
      if (err) return reject(err);
      if (!reportRow) return resolve(null);

      let ids = [];
      try {
        ids = JSON.parse(reportRow.suggested_entries);
      } catch (e) {
        ids = [];
      }

      if (ids.length === 0) {
        resolve({ report: reportRow, entries: [] });
        return;
      }

      const placeholders = ids.map(() => '?').join(',');
      const sql = `
        SELECT e.*, f.title as feed_title
        FROM rss_feed_entries e
        JOIN rss_feeds f ON e.feed_id = f.id
        WHERE e.id IN (${placeholders})
      `;

      db.all(sql, ids, (err, entryRows) => {
        if (err) reject(err);
        else resolve({ report: reportRow, entries: entryRows });
      });
    });
  });
});

// 6. Direct Settings wrapper
ipcMain.handle('get-settings', async () => {
  return loadSettings();
});

ipcMain.handle('save-settings', async (event, settings) => {
  return saveSettings(settings);
});

// 7. CLI Execution Command Bridge
ipcMain.handle('run-python-cli', async (event, args) => {
  return new Promise((resolve) => {
    // Format command with safety
    const cmdArgs = args.map(arg => `"${arg.replace(/"/g, '\\"')}"`).join(' ');
    const commandLine = `uv run kb-rss ${cmdArgs}`;
    console.log(`Executing background python command: ${commandLine}`);
    
    exec(commandLine, { cwd: projectRoot }, (error, stdout, stderr) => {
      if (error) {
        console.error(`Python CLI failure: ${stderr || error.message}`);
        resolve({ status: 'error', message: stderr || error.message });
      } else {
        updateTrayMenu();
        resolve({ status: 'success', stdout: stdout.trim() });
      }
    });
  });
});

// 8. Open URL natively
ipcMain.handle('open-url', async (event, url) => {
  shell.openExternal(url);
  return { status: 'success' };
});
