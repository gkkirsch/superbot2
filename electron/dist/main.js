"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("node:path"));
const fs = __importStar(require("node:fs"));
const os = __importStar(require("node:os"));
const dashboard_js_1 = require("./processes/dashboard.js");
const orchestrator_js_1 = require("./processes/orchestrator.js");
const heartbeat_js_1 = require("./processes/heartbeat.js");
const scheduler_js_1 = require("./processes/scheduler.js");
const logger_js_1 = require("./logger.js");
const updater_js_1 = require("./updater.js");
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
function loadWindowState() {
    try {
        const raw = fs.readFileSync(WINDOW_STATE_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
            width: typeof parsed.width === 'number' ? parsed.width : DEFAULT_WIDTH,
            height: typeof parsed.height === 'number' ? parsed.height : DEFAULT_HEIGHT,
            ...(typeof parsed.x === 'number' ? { x: parsed.x } : {}),
            ...(typeof parsed.y === 'number' ? { y: parsed.y } : {}),
        };
    }
    catch {
        return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
    }
}
function saveWindowState(win) {
    try {
        const bounds = win.getBounds();
        const state = {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
        };
        // Ensure the directory exists before writing.
        const dir = path.dirname(WINDOW_STATE_PATH);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(WINDOW_STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
    }
    catch (err) {
        console.warn('superbot2: failed to save window state:', err);
    }
}
// ── Single-instance lock ────────────────────────────────────────────────
const gotLock = electron_1.app.requestSingleInstanceLock();
if (!gotLock) {
    // Another instance is already running — exit immediately.
    console.log('superbot2: another instance is already running. Exiting.');
    electron_1.app.quit();
}
// ── Module-level references (prevent garbage collection) ────────────────
let tray = null;
let mainWindow = null;
/** When true, the close handler will allow the window to actually close. */
let isQuitting = false;
// ── Managed processes ───────────────────────────────────────────────────
const dashboardProcess = new dashboard_js_1.DashboardProcess();
const orchestratorProcess = new orchestrator_js_1.OrchestratorProcess();
const heartbeatProcess = new heartbeat_js_1.HeartbeatProcess();
const schedulerProcess = new scheduler_js_1.SchedulerProcess();
// ── Helper: build the tray icon ─────────────────────────────────────────
function createTrayIcon() {
    // On macOS, images whose filename ends with "Template" are automatically
    // tinted to match the system menu-bar appearance (dark / light).
    const iconPath = path.join(__dirname, '..', 'assets', 'iconTemplate.png');
    let icon = electron_1.nativeImage.createFromPath(iconPath);
    // Fallback to an empty 22x22 image if the file is missing or broken.
    if (icon.isEmpty()) {
        console.warn('superbot2: tray icon not found at', iconPath, '— using empty placeholder');
        icon = electron_1.nativeImage.createEmpty();
    }
    // Mark as template image so macOS applies automatic tinting.
    icon.setTemplateImage(true);
    return icon;
}
// ── Helper: show or focus the dashboard window ──────────────────────────
function showDashboard() {
    if (!mainWindow)
        return;
    // Temporarily show dock icon so macOS allows the window to take focus.
    if (electron_1.app.dock) {
        electron_1.app.dock.show();
    }
    mainWindow.show();
    mainWindow.focus();
}
// ── Helper: create the BrowserWindow ────────────────────────────────────
function createMainWindow() {
    const state = loadWindowState();
    const win = new electron_1.BrowserWindow({
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
    // Show the window once it has content ready to display.
    win.once('ready-to-show', () => {
        showDashboard();
    });
    // Dashboard URL depends on mode: Vite dev server or production Express server.
    const dashboardUrl = electron_1.app.isPackaged
        ? `http://localhost:${DASHBOARD_API_PORT}`
        : `http://localhost:${DASHBOARD_UI_PORT}`;
    // Poll until the dashboard server is ready, then load the URL.
    // In production the server is started by DashboardProcess after this window
    // is created, so loadURL would fail with ERR_CONNECTION_REFUSED without this.
    const pollAndLoad = (attempt = 0) => {
        if (win.isDestroyed())
            return;
        const http = require('node:http');
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
function statusDot(status) {
    switch (status) {
        case 'running': return '\u{1F7E2}'; // green circle
        case 'error': return '\u{1F7E1}'; // yellow circle
        case 'stopped':
        default: return '\u{1F534}'; // red circle
    }
}
// ── Helper: build the context menu ──────────────────────────────────────
/**
 * Build the tray context menu dynamically based on current process state
 * and auto-launch settings.
 */
function buildContextMenu() {
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
    const openAtLogin = electron_1.app.getLoginItemSettings().openAtLogin;
    return electron_1.Menu.buildFromTemplate([
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
                void electron_1.shell.openPath(logger_js_1.logger.getLogPath());
            },
        },
        {
            label: 'Check for Updates',
            click: () => {
                (0, updater_js_1.checkForUpdates)();
            },
        },
        // 6. Start at Login (checkbox)
        {
            label: 'Start at Login',
            type: 'checkbox',
            checked: openAtLogin,
            click: (menuItem) => {
                electron_1.app.setLoginItemSettings({ openAtLogin: menuItem.checked });
                logger_js_1.logger.info('main', `Auto-launch set to ${menuItem.checked}`);
                rebuildTrayMenu();
            },
        },
        { type: 'separator' },
        // 7. Quit
        {
            label: 'Quit Superbot2',
            click: () => {
                electron_1.app.quit();
            },
        },
    ]);
}
/**
 * Rebuild and re-attach the tray context menu.
 * Called whenever process status changes so the menu reflects current state.
 */
function rebuildTrayMenu() {
    if (tray) {
        tray.setContextMenu(buildContextMenu());
    }
}
// ── Auto-launch: register as Login Item on first launch ─────────────────
/**
 * On first launch, enable "Start at Login" by default.
 * Uses a flag file to avoid re-setting on every launch.
 */
function ensureAutoLaunchOnFirstRun() {
    try {
        if (!fs.existsSync(FIRST_LAUNCH_FLAG_PATH)) {
            electron_1.app.setLoginItemSettings({ openAtLogin: true });
            console.log('superbot2: first launch — auto-launch enabled');
            // Write the flag file so we don't re-set on subsequent launches.
            const dir = path.dirname(FIRST_LAUNCH_FLAG_PATH);
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(FIRST_LAUNCH_FLAG_PATH, 'done', 'utf-8');
        }
    }
    catch (err) {
        console.warn('superbot2: failed to configure auto-launch on first run:', err);
    }
}
// ── IPC handlers ────────────────────────────────────────────────────────
electron_1.ipcMain.handle('get-process-status', (_event, name) => {
    const processes = {
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
    proc.on('status-changed', (status, name) => {
        logger_js_1.logger.info(name, `status: ${status}`);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('process-status-changed', { name, status });
        }
        rebuildTrayMenu();
    });
}
// ── App lifecycle events ────────────────────────────────────────────────
electron_1.app.on('ready', () => {
    // Hide the dock icon — this is a tray-only app.
    if (electron_1.app.dock) {
        electron_1.app.dock.hide();
    }
    // On first launch, enable auto-launch as a macOS Login Item.
    ensureAutoLaunchOnFirstRun();
    // Create the tray icon and attach the context menu.
    const icon = createTrayIcon();
    tray = new electron_1.Tray(icon);
    tray.setToolTip('Superbot2');
    tray.setContextMenu(buildContextMenu());
    // Clicking the tray icon also shows/focuses the dashboard window.
    tray.on('click', () => {
        showDashboard();
    });
    // Create the dashboard BrowserWindow (shows automatically once content loads).
    mainWindow = createMainWindow();
    // Start managed processes.
    dashboardProcess.start();
    orchestratorProcess.start();
    heartbeatProcess.start();
    schedulerProcess.start();
    logger_js_1.logger.info('main', 'Superbot2 tray app started');
    console.log('superbot2: tray app is ready');
    // Initialize auto-updater (only in packaged builds)
    if (electron_1.app.isPackaged) {
        (0, updater_js_1.initAutoUpdater)();
    }
});
electron_1.app.on('second-instance', (_event, _commandLine, _workingDirectory) => {
    // A second instance tried to launch — show and focus the dashboard window.
    console.log('superbot2: second instance attempted — showing dashboard');
    showDashboard();
    // If the window was minimized, restore it.
    if (mainWindow && mainWindow.isMinimized()) {
        mainWindow.restore();
    }
});
electron_1.app.on('window-all-closed', () => {
    // Intentionally do NOT quit. Tray apps stay alive without windows.
});
electron_1.app.on('before-quit', (e) => {
    if (!isQuitting) {
        e.preventDefault();
        isQuitting = true;
        logger_js_1.logger.info('main', 'Superbot2 shutting down');
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
            electron_1.app.quit();
        });
    }
});
//# sourceMappingURL=main.js.map