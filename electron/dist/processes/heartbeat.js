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
exports.HeartbeatProcess = void 0;
const node_child_process_1 = require("node:child_process");
const path = __importStar(require("node:path"));
const os = __importStar(require("node:os"));
const electron_1 = require("electron");
const manager_js_1 = require("./manager.js");
const logger_js_1 = require("../logger.js");
/** Run heartbeat every 30 minutes. */
const HEARTBEAT_INTERVAL_MS = 30 * 60 * 1000;
/**
 * Manages the heartbeat process.
 *
 * Unlike long-running processes, the heartbeat is interval-based:
 * it spawns heartbeat-cron.sh periodically, and the script exits
 * after each run. The process is considered "running" as long as
 * the interval is active.
 */
class HeartbeatProcess extends manager_js_1.ProcessManager {
    scriptPath;
    superbotHome;
    intervalTimer = null;
    activeChild = null;
    constructor() {
        super('heartbeat');
        if (electron_1.app.isPackaged) {
            this.scriptPath = path.join(process.resourcesPath, 'scripts', 'heartbeat-cron.sh');
        }
        else {
            this.scriptPath = path.resolve(__dirname, '..', '..', '..', 'scripts', 'heartbeat-cron.sh');
        }
        this.superbotHome = process.env['SUPERBOT2_HOME'] ?? path.join(os.homedir(), '.superbot2');
    }
    start() {
        if (this.intervalTimer)
            return;
        logger_js_1.logger.info('heartbeat', 'Started (interval: 30min)');
        this.setStatus('running');
        // Run immediately, then on interval
        this.runOnce();
        this.intervalTimer = setInterval(() => this.runOnce(), HEARTBEAT_INTERVAL_MS);
    }
    stop() {
        if (this.intervalTimer) {
            clearInterval(this.intervalTimer);
            this.intervalTimer = null;
        }
        // Kill any currently running script
        if (this.activeChild && !this.activeChild.killed) {
            this.activeChild.kill('SIGTERM');
        }
        this.activeChild = null;
        this.setStatus('stopped');
        logger_js_1.logger.info('heartbeat', 'Stopped');
        return Promise.resolve();
    }
    runOnce() {
        // Skip if a previous run is still going
        if (this.activeChild)
            return;
        const child = (0, node_child_process_1.spawn)('bash', [this.scriptPath], {
            env: {
                ...process.env,
                SUPERBOT2_HOME: this.superbotHome,
                SUPERBOT2_NAME: process.env['SUPERBOT2_NAME'] ?? 'superbot2',
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        this.activeChild = child;
        child.stderr?.on('data', (chunk) => {
            logger_js_1.logger.warn('heartbeat', chunk.toString().trimEnd());
        });
        child.on('exit', (code) => {
            this.activeChild = null;
            if (code !== 0 && code !== null) {
                logger_js_1.logger.error('heartbeat', `Script exited with code ${code}`);
            }
        });
        child.on('error', (err) => {
            this.activeChild = null;
            logger_js_1.logger.error('heartbeat', `Spawn error: ${err.message}`);
            this.setStatus('error');
        });
    }
}
exports.HeartbeatProcess = HeartbeatProcess;
//# sourceMappingURL=heartbeat.js.map