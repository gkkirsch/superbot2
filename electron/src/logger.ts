import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ── Constants ────────────────────────────────────────────────────────────

const LOG_DIR = path.join(os.homedir(), '.superbot2', 'logs');
const LOG_FILE = 'electron-app.log';
const LOG_PATH = path.join(LOG_DIR, LOG_FILE);

/** Maximum log file size in bytes before rotation (5 MB). */
const MAX_LOG_SIZE = 5 * 1024 * 1024;

/** Number of rotated log files to keep. */
const MAX_ROTATED_FILES = 3;

/**
 * Whether to also log to the console.
 * True unless running inside a packaged Electron app.
 * (app.isPackaged is not available here since logger loads before Electron
 *  app is ready, so we check for the ELECTRON_IS_PACKAGED env var that
 *  electron-builder sets, or fall back to checking resourcesPath.)
 */
const IS_DEV = !process.env['ELECTRON_IS_PACKAGED']
  && !process.argv[0]?.includes('.app/Contents/');

// ── Log types ────────────────────────────────────────────────────────────

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';
export type LogSource =
  | 'main'
  | 'orchestrator'
  | 'dashboard'
  | 'heartbeat'
  | 'scheduler'
  | 'watchdog';

// ── Internal state ───────────────────────────────────────────────────────

let dirEnsured = false;

function ensureLogDir(): void {
  if (dirEnsured) return;
  fs.mkdirSync(LOG_DIR, { recursive: true });
  dirEnsured = true;
}

// ── Log rotation ─────────────────────────────────────────────────────────

/**
 * Rotate the log file if it exceeds MAX_LOG_SIZE.
 * Keeps up to MAX_ROTATED_FILES rotated copies:
 *   electron-app.log -> electron-app.1.log -> electron-app.2.log -> ...
 */
function rotateIfNeeded(): void {
  try {
    const stats = fs.statSync(LOG_PATH);
    if (stats.size < MAX_LOG_SIZE) return;

    // Shift existing rotated files: .3 -> delete, .2 -> .3, .1 -> .2
    for (let i = MAX_ROTATED_FILES; i >= 1; i--) {
      const older = path.join(LOG_DIR, `electron-app.${i}.log`);
      if (i === MAX_ROTATED_FILES) {
        // Delete the oldest
        try { fs.unlinkSync(older); } catch { /* ignore */ }
      } else {
        const newer = path.join(LOG_DIR, `electron-app.${i + 1}.log`);
        try { fs.renameSync(older, newer); } catch { /* ignore */ }
      }
    }

    // Move current log to .1
    fs.renameSync(LOG_PATH, path.join(LOG_DIR, 'electron-app.1.log'));
  } catch {
    // File doesn't exist yet or rotation failed — not critical
  }
}

// ── Core write ───────────────────────────────────────────────────────────

function writeLine(level: LogLevel, source: LogSource, message: string): void {
  try {
    ensureLogDir();
    rotateIfNeeded();

    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${level}] [${source}] ${message}\n`;
    fs.appendFileSync(LOG_PATH, line, 'utf-8');

    if (IS_DEV) {
      const consoleFn = level === 'ERROR' ? console.error
        : level === 'WARN' ? console.warn
        : console.log;
      consoleFn(`[${level}] [${source}] ${message}`);
    }
  } catch {
    // Don't crash the app if logging fails
  }
}

// ── Public API ───────────────────────────────────────────────────────────

export const logger = {
  info:  (source: LogSource, message: string) => writeLine('INFO', source, message),
  warn:  (source: LogSource, message: string) => writeLine('WARN', source, message),
  error: (source: LogSource, message: string) => writeLine('ERROR', source, message),
  getLogPath: () => LOG_PATH,
};
