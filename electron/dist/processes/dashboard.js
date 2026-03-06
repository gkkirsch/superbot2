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
exports.DashboardProcess = void 0;
const path = __importStar(require("node:path"));
const os = __importStar(require("node:os"));
const electron_1 = require("electron");
const manager_js_1 = require("./manager.js");
/**
 * Default port the dashboard API server listens on.
 */
const DEFAULT_API_PORT = '3274';
/**
 * Manages the dashboard child process.
 *
 * In dev mode the dashboard server is spawned as:
 *   node <repo-root>/dashboard/server.js
 *
 * In production (packaged app) the server is at:
 *   <resourcesPath>/dashboard/server.js
 *
 * Environment variables forwarded to the child:
 *   - SUPERBOT2_API_PORT  (default 3274)
 *   - SUPERBOT2_HOME      (default ~/.superbot2)
 */
class DashboardProcess extends manager_js_1.ProcessManager {
    serverScript;
    apiPort;
    superbotHome;
    constructor() {
        super('dashboard');
        if (electron_1.app.isPackaged) {
            this.serverScript = path.join(process.resourcesPath, 'dashboard', 'server.js');
        }
        else {
            // Dev mode: dist/processes/ -> dist/ -> electron/ -> superbot2/ -> dashboard/
            this.serverScript = path.resolve(__dirname, '..', '..', '..', 'dashboard', 'server.js');
        }
        this.apiPort = process.env['SUPERBOT2_API_PORT'] ?? DEFAULT_API_PORT;
        this.superbotHome = process.env['SUPERBOT2_HOME'] ?? path.join(os.homedir(), '.superbot2');
    }
    getSpawnOptions() {
        return {
            command: 'node',
            args: [this.serverScript],
            env: {
                PATH: process.env['PATH'] ?? '',
                SUPERBOT2_API_PORT: this.apiPort,
                SUPERBOT2_HOME: this.superbotHome,
            },
        };
    }
}
exports.DashboardProcess = DashboardProcess;
//# sourceMappingURL=dashboard.js.map