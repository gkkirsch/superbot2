"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
/**
 * Preload script — exposes a safe API surface to the renderer via contextBridge.
 *
 * Provides an IPC bridge so the dashboard UI can query process status
 * and subscribe to real-time status change events from the main process.
 */
electron_1.contextBridge.exposeInMainWorld('superbot', {
    /**
     * Request the current status of a managed process by name.
     * Returns 'stopped' | 'running' | 'error'.
     */
    getProcessStatus: (name) => {
        return electron_1.ipcRenderer.invoke('get-process-status', name);
    },
    /** Get setup status (complete flag + dependency checks). */
    getSetupStatus: () => {
        return electron_1.ipcRenderer.invoke('get-setup-status');
    },
    /** Mark setup as complete. */
    completeSetup: () => {
        return electron_1.ipcRenderer.invoke('complete-setup');
    },
    /** Re-run setup checks. */
    rerunSetupChecks: () => {
        return electron_1.ipcRenderer.invoke('rerun-setup-checks');
    },
    /**
     * Subscribe to process status change events.
     * The callback receives an object with { name: string, status: string }.
     * Returns an unsubscribe function.
     */
    onProcessStatusChanged: (callback) => {
        const handler = (_event, data) => {
            callback(data);
        };
        electron_1.ipcRenderer.on('process-status-changed', handler);
        return () => {
            electron_1.ipcRenderer.removeListener('process-status-changed', handler);
        };
    },
});
//# sourceMappingURL=preload.js.map