import {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  NativeImage,
  shell,
} from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { DashboardProcess } from './processes/dashboard.js';
import { OrchestratorProcess } from './processes/orchestrator.js';
import { HeartbeatProcess } from './processes/heartbeat.js';
import { SchedulerProcess } from './processes/scheduler.js';
import { logger, type LogSource } from './logger.js';
import { initAutoUpdater, checkForUpdates } from './updater.js';

/**
 * superbot2 Electron main process.
 *
 * Runs as a macOS menu-bar tray app (no dock icon).
 * Manages a system tray icon with a context menu, a dashboard
 * BrowserWindow, and child processes (dashboard + orchestrator).
 * Enforces single-instance execution via requestSingleInstanceLock().
 * Registers as a macOS Login Item so it starts automatically on login.
 */

// ── Constants ───────────────────────────────────────────────────────────

/** Port where the Vite dev server (dev) or dashboard server (production) runs. */
const DASHBOARD_UI_PORT = 47474;
const DASHBOARD_API_PORT = 3274;

/** Path to the JSON file that persists window size and position. */
const WINDOW_STATE_PATH = path.join(os.homedir(), '.superbot2', 'electron-window-state.json');

/** Path to the JSON file that tracks whether this is the first launch. */
const FIRST_LAUNCH_FLAG_PATH = path.join(os.homedir(), '.superbot2', 'electron-first-launch-done');

/** Default window dimensions. */
const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 800;

// ── Window state persistence ────────────────────────────────────────────

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

function loadWindowState(): WindowState {
  try {
    const raw = fs.readFileSync(WINDOW_STATE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<WindowState>;
    return {
      width: typeof parsed.width === 'number' ? parsed.width : DEFAULT_WIDTH,
      height: typeof parsed.height === 'number' ? parsed.height : DEFAULT_HEIGHT,
      ...(typeof parsed.x === 'number' ? { x: parsed.x } : {}),
      ...(typeof parsed.y === 'number' ? { y: parsed.y } : {}),
    };
  } catch {
    return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
  }
}

function saveWindowState(win: BrowserWindow): void {
  try {
    const bounds = win.getBounds();
    const state: WindowState = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    };
    // Ensure the directory exists before writing.
    const dir = path.dirname(WINDOW_STATE_PATH);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(WINDOW_STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.warn('superbot2: failed to save window state:', err);
  }
}

// ── Single-instance lock ────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  // Another instance is already running — exit immediately.
  console.log('superbot2: another instance is already running. Exiting.');
  app.quit();
}

// ── Module-level references (prevent garbage collection) ────────────────
let tray: Tray | null = null;
let mainWindow: BrowserWindow | null = null;

/** When true, the close handler will allow the window to actually close. */
let isQuitting = false;

// ── Managed processes ───────────────────────────────────────────────────
const dashboardProcess = new DashboardProcess();
const orchestratorProcess = new OrchestratorProcess();
const heartbeatProcess = new HeartbeatProcess();
const schedulerProcess = new SchedulerProcess();

// ── Helper: build the tray icon ─────────────────────────────────────────
function createTrayIcon(): NativeImage {
  // On macOS, images whose filename ends with "Template" are automatically
  // tinted to match the system menu-bar appearance (dark / light).
  const iconPath = path.join(__dirname, '..', 'assets', 'iconTemplate.png');

  let icon = nativeImage.createFromPath(iconPath);

  // Fallback to an empty 22x22 image if the file is missing or broken.
  if (icon.isEmpty()) {
    console.warn('superbot2: tray icon not found at', iconPath, '— using empty placeholder');
    icon = nativeImage.createEmpty();
  }

  // Mark as template image so macOS applies automatic tinting.
  icon.setTemplateImage(true);

  return icon;
}

// ── Helper: show or focus the dashboard window ──────────────────────────
function showDashboard(): void {
  if (!mainWindow) return;
  // Temporarily show dock icon so macOS allows the window to take focus.
  if (app.dock) {
    app.dock.show();
  }
  mainWindow.show();
  mainWindow.focus();
}

// ── Helper: create the BrowserWindow ────────────────────────────────────
function createMainWindow(): BrowserWindow {
  const state = loadWindowState();

  const win = new BrowserWindow({
    width: state.width,
    height: state.height,
    ...(state.x !== undefined && state.y !== undefined ? { x: state.x, y: state.y } : {}),
    show: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Dashboard URL depends on mode: Vite dev server or production Express server.
  const dashboardUrl = app.isPackaged
    ? `http://localhost:${DASHBOARD_API_PORT}`
    : `http://localhost:${DASHBOARD_UI_PORT}`;

  // Poll until the dashboard server is ready, then load the URL.
  // In production the server is started by DashboardProcess after this window
  // is created, so loadURL would fail with ERR_CONNECTION_REFUSED without this.
  const pollAndLoad = (attempt = 0): void => {
    if (win.isDestroyed()) return;
    const http = require('node:http') as typeof import('node:http');
    const req = http.get(dashboardUrl, (res) => {
      res.resume(); // drain
      win.loadURL(dashboardUrl);
    });
    req.on('error', () => {
      if (attempt < 30) {
        setTimeout(() => pollAndLoad(attempt + 1), 500);
      }
    });
    req.end();
  };
  pollAndLoad();

  // Intercept close: hide instead of destroying (unless the app is quitting).
  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  // Persist window bounds on move and resize.
  win.on('moved', () => saveWindowState(win));
  win.on('resized', () => saveWindowState(win));

  return win;
}

// ── Helper: get status indicator ─────────────────────────────────────────

/**
 * Returns a colored dot + label for the given process status.
 * Green = running, red = stopped, yellow = error.
 */
function statusDot(status: string): string {
  switch (status) {
    case 'running': return '\u{1F7E2}';  // green circle
    case 'error':   return '\u{1F7E1}';  // yellow circle
    case 'stopped':
    default:        return '\u{1F534}';  // red circle
  }
}

// ── Helper: build the context menu ──────────────────────────────────────

/**
 * Build the tray context menu dynamically based on current process state
 * and auto-launch settings.
 */
function buildContextMenu(): Menu {
  const orchStatus = orchestratorProcess.getStatus();
  const dashStatus = dashboardProcess.getStatus();
  const hbStatus = heartbeatProcess.getStatus();
  const schedStatus = schedulerProcess.getStatus();

  const orchRunning = orchStatus === 'running';
  const allRunning = orchRunning
    && dashStatus === 'running'
    && hbStatus === 'running'
    && schedStatus === 'running';

  const headerLabel = allRunning ? 'Superbot2 Running' : 'Superbot2';

  const openAtLogin = app.getLoginItemSettings().openAtLogin;

  return Menu.buildFromTemplate([
    // 1. Status header
    {
      label: headerLabel,
      enabled: false,
    },

    // 2. Show Dashboard
    {
      label: 'Show Dashboard',
      click: () => {
        showDashboard();
      },
    },

    { type: 'separator' },

    // 3. Per-process status indicators
    {
      label: `${statusDot(orchStatus)}  Orchestrator`,
      enabled: false,
    },
    {
      label: `${statusDot(dashStatus)}  Dashboard`,
      enabled: false,
    },
    {
      label: `${statusDot(hbStatus)}  Heartbeat`,
      enabled: false,
    },
    {
      label: `${statusDot(schedStatus)}  Scheduler`,
      enabled: false,
    },

    { type: 'separator' },

    // 4. Start / Stop / Restart Orchestrator (dynamic)
    {
      label: 'Start Orchestrator',
      visible: !orchRunning,
      click: () => {
        orchestratorProcess.start();
      },
    },
    {
      label: 'Stop Orchestrator',
      visible: orchRunning,
      click: () => {
        void orchestratorProcess.stop();
      },
    },
    {
      label: 'Restart Orchestrator',
      visible: orchRunning,
      click: () => {
        void orchestratorProcess.restart();
      },
    },

    { type: 'separator' },

    // 5. View Logs & Updates
    {
      label: 'View Logs',
      click: () => {
        void shell.openPath(logger.getLogPath());
      },
    },
    {
      label: 'Check for Updates',
      click: () => {
        checkForUpdates();
      },
    },

    // 6. Start at Login (checkbox)
    {
      label: 'Start at Login',
      type: 'checkbox',
      checked: openAtLogin,
      click: (menuItem) => {
        app.setLoginItemSettings({ openAtLogin: menuItem.checked });
        logger.info('main', `Auto-launch set to ${menuItem.checked}`);
        rebuildTrayMenu();
      },
    },

    { type: 'separator' },

    // 7. Quit
    {
      label: 'Quit Superbot2',
      click: () => {
        app.quit();
      },
    },
  ]);
}

/**
 * Rebuild and re-attach the tray context menu.
 * Called whenever process status changes so the menu reflects current state.
 */
function rebuildTrayMenu(): void {
  if (tray) {
    tray.setContextMenu(buildContextMenu());
  }
}

// ── Auto-launch: register as Login Item on first launch ─────────────────

/**
 * On first launch, enable "Start at Login" by default.
 * Uses a flag file to avoid re-setting on every launch.
 */
function ensureAutoLaunchOnFirstRun(): void {
  try {
    if (!fs.existsSync(FIRST_LAUNCH_FLAG_PATH)) {
      app.setLoginItemSettings({ openAtLogin: true });
      console.log('superbot2: first launch — auto-launch enabled');

      // Write the flag file so we don't re-set on subsequent launches.
      const dir = path.dirname(FIRST_LAUNCH_FLAG_PATH);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(FIRST_LAUNCH_FLAG_PATH, 'done', 'utf-8');
    }
  } catch (err) {
    console.warn('superbot2: failed to configure auto-launch on first run:', err);
  }
}

// ── IPC handlers ────────────────────────────────────────────────────────

ipcMain.handle('get-process-status', (_event, name: string) => {
  const processes: Record<string, { getStatus: () => string }> = {
    dashboard: dashboardProcess,
    orchestrator: orchestratorProcess,
    heartbeat: heartbeatProcess,
    scheduler: schedulerProcess,
  };
  return processes[name]?.getStatus() ?? 'stopped';
});

// Forward status changes from all processes to the renderer and rebuild
// the tray menu so it always reflects current state.
for (const proc of [dashboardProcess, orchestratorProcess, heartbeatProcess, schedulerProcess]) {
  proc.on('status-changed', (status: string, name: string) => {
    logger.info(name as LogSource, `status: ${status}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('process-status-changed', { name, status });
    }
    rebuildTrayMenu();
  });
}

// ── App lifecycle events ────────────────────────────────────────────────

app.on('ready', () => {
  // Hide the dock icon — this is a tray-only app.
  if (app.dock) {
    app.dock.hide();
  }

  // On first launch, enable auto-launch as a macOS Login Item.
  ensureAutoLaunchOnFirstRun();

  // Create the tray icon and attach the context menu.
  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('Superbot2');
  tray.setContextMenu(buildContextMenu());

  // Create the dashboard BrowserWindow (hidden initially).
  mainWindow = createMainWindow();

  // Start managed processes.
  dashboardProcess.start();
  orchestratorProcess.start();
  heartbeatProcess.start();
  schedulerProcess.start();

  logger.info('main', 'Superbot2 tray app started');
  console.log('superbot2: tray app is ready');

  // Initialize auto-updater (only in packaged builds)
  if (app.isPackaged) {
    initAutoUpdater();
  }
});

app.on('second-instance', (_event, _commandLine, _workingDirectory) => {
  // A second instance tried to launch — show and focus the dashboard window.
  console.log('superbot2: second instance attempted — showing dashboard');
  showDashboard();

  // If the window was minimized, restore it.
  if (mainWindow && mainWindow.isMinimized()) {
    mainWindow.restore();
  }
});

app.on('window-all-closed', () => {
  // Intentionally do NOT quit. Tray apps stay alive without windows.
});

app.on('before-quit', (e) => {
  if (!isQuitting) {
    e.preventDefault();
    isQuitting = true;

    logger.info('main', 'Superbot2 shutting down');
    console.log('superbot2: shutting down');

    // Save window state one final time before exit.
    if (mainWindow && !mainWindow.isDestroyed()) {
      saveWindowState(mainWindow);
    }

    // Stop all managed processes, then quit for real.
    Promise.all([
      orchestratorProcess.stop(),
      dashboardProcess.stop(),
      heartbeatProcess.stop(),
      schedulerProcess.stop(),
    ]).finally(() => {
      app.quit();
    });
  }
});
