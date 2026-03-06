import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload script — exposes a safe API surface to the renderer via contextBridge.
 *
 * Provides an IPC bridge so the dashboard UI can query process status
 * and subscribe to real-time status change events from the main process.
 */

contextBridge.exposeInMainWorld('superbot', {
  /**
   * Request the current status of a managed process by name.
   * Returns 'stopped' | 'running' | 'error'.
   */
  getProcessStatus: (name: string): Promise<string> => {
    return ipcRenderer.invoke('get-process-status', name);
  },

  /**
   * Subscribe to process status change events.
   * The callback receives an object with { name: string, status: string }.
   * Returns an unsubscribe function.
   */
  onProcessStatusChanged: (callback: (data: { name: string; status: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { name: string; status: string }) => {
      callback(data);
    };
    ipcRenderer.on('process-status-changed', handler);
    return () => {
      ipcRenderer.removeListener('process-status-changed', handler);
    };
  },
});
