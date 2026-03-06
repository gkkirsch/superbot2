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
exports.SchedulerProcess = void 0;
const node_child_process_1 = require("node:child_process");
const path = __importStar(require("node:path"));
const os = __importStar(require("node:os"));
const electron_1 = require("electron");
const manager_js_1 = require("./manager.js");
const logger_js_1 = require("../logger.js");
/** Run scheduler every 60 seconds. */
const SCHEDULER_INTERVAL_MS = 60 * 1000;
/**
 * Manages the job scheduler process.
 *
 * Interval-based: spawns scheduler.sh every 60 seconds to check
 * for due scheduled jobs. The process is considered "running" as
 * long as the interval is active.
 */
class SchedulerProcess extends manager_js_1.ProcessManager {
    scriptPath;
    superbotHome;
    intervalTimer = null;
    activeChild = null;
    constructor() {
        super('scheduler');
        if (electron_1.app.isPackaged) {
            this.scriptPath = path.join(process.resourcesPath, 'scripts', 'scheduler.sh');
        }
        else {
            this.scriptPath = path.resolve(__dirname, '..', '..', '..', 'scripts', 'scheduler.sh');
        }
        this.superbotHome = process.env['SUPERBOT2_HOME'] ?? path.join(os.homedir(), '.superbot2');
    }
    start() {
        if (this.intervalTimer)
            return;
        logger_js_1.logger.info('scheduler', 'Started (interval: 60s)');
        this.setStatus('running');
        // Run immediately, then on interval
        this.runOnce();
        this.intervalTimer = setInterval(() => this.runOnce(), SCHEDULER_INTERVAL_MS);
    }
    stop() {
        if (this.intervalTimer) {
            clearInterval(this.intervalTimer);
            this.intervalTimer = null;
        }
        if (this.activeChild && !this.activeChild.killed) {
            this.activeChild.kill('SIGTERM');
        }
        this.activeChild = null;
        this.setStatus('stopped');
        logger_js_1.logger.info('scheduler', 'Stopped');
        return Promise.resolve();
    }
    runOnce() {
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
            logger_js_1.logger.warn('scheduler', chunk.toString().trimEnd());
        });
        child.on('exit', (code) => {
            this.activeChild = null;
            if (code !== 0 && code !== null) {
                logger_js_1.logger.error('scheduler', `Script exited with code ${code}`);
            }
        });
        child.on('error', (err) => {
            this.activeChild = null;
            logger_js_1.logger.error('scheduler', `Spawn error: ${err.message}`);
            this.setStatus('error');
        });
    }
}
exports.SchedulerProcess = SchedulerProcess;
//# sourceMappingURL=scheduler.js.map