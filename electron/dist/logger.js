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
exports.logger = void 0;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const os = __importStar(require("node:os"));
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
// ── Internal state ───────────────────────────────────────────────────────
let dirEnsured = false;
function ensureLogDir() {
    if (dirEnsured)
        return;
    fs.mkdirSync(LOG_DIR, { recursive: true });
    dirEnsured = true;
}
// ── Log rotation ─────────────────────────────────────────────────────────
/**
 * Rotate the log file if it exceeds MAX_LOG_SIZE.
 * Keeps up to MAX_ROTATED_FILES rotated copies:
 *   electron-app.log -> electron-app.1.log -> electron-app.2.log -> ...
 */
function rotateIfNeeded() {
    try {
        const stats = fs.statSync(LOG_PATH);
        if (stats.size < MAX_LOG_SIZE)
            return;
        // Shift existing rotated files: .3 -> delete, .2 -> .3, .1 -> .2
        for (let i = MAX_ROTATED_FILES; i >= 1; i--) {
            const older = path.join(LOG_DIR, `electron-app.${i}.log`);
            if (i === MAX_ROTATED_FILES) {
                // Delete the oldest
                try {
                    fs.unlinkSync(older);
                }
                catch { /* ignore */ }
            }
            else {
                const newer = path.join(LOG_DIR, `electron-app.${i + 1}.log`);
                try {
                    fs.renameSync(older, newer);
                }
                catch { /* ignore */ }
            }
        }
        // Move current log to .1
        fs.renameSync(LOG_PATH, path.join(LOG_DIR, 'electron-app.1.log'));
    }
    catch {
        // File doesn't exist yet or rotation failed — not critical
    }
}
// ── Core write ───────────────────────────────────────────────────────────
function writeLine(level, source, message) {
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
    }
    catch {
        // Don't crash the app if logging fails
    }
}
// ── Public API ───────────────────────────────────────────────────────────
exports.logger = {
    info: (source, message) => writeLine('INFO', source, message),
    warn: (source, message) => writeLine('WARN', source, message),
    error: (source, message) => writeLine('ERROR', source, message),
    getLogPath: () => LOG_PATH,
};
//# sourceMappingURL=logger.js.map