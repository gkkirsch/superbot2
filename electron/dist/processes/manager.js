"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcessManager = void 0;
const node_child_process_1 = require("node:child_process");
const node_events_1 = require("node:events");
// ── Kill timeout (ms) ──────────────────────────────────────────────────
const KILL_TIMEOUT_MS = 5_000;
/**
 * Base process manager.
 *
 * Provides start / stop / restart lifecycle for a single child process.
 * Concrete subclasses (orchestrator, dashboard, etc.) extend this and
 * override `getSpawnOptions()` to define what command to run.
 *
 * Emits the following events via EventEmitter:
 *   - 'status-changed' (status: ProcessStatus, name: string)
 *   - 'output'         (data: string, name: string)
 *   - 'error'          (data: string, name: string)
 */
class ProcessManager extends node_events_1.EventEmitter {
    name;
    process = null;
    status = 'stopped';
    killTimer = null;
    constructor(name) {
        super();
        this.name = name;
    }
    // ── Public API ──────────────────────────────────────────────────────
    /**
     * Start the managed process. Calls `getSpawnOptions()` to determine
     * what to spawn. If the process is already running this is a no-op.
     */
    start() {
        if (this.process && !this.process.killed) {
            console.log(`[${this.name}] already running — ignoring start()`);
            return;
        }
        const opts = this.getSpawnOptions();
        if (!opts) {
            console.log(`[${this.name}] getSpawnOptions() returned nothing — cannot start`);
            return;
        }
        this.spawnProcess(opts);
    }
    /**
     * Stop the managed process. Sends SIGTERM first; if the process does
     * not exit within 5 seconds, sends SIGKILL.
     *
     * Returns a promise that resolves once the process has exited.
     */
    stop() {
        return new Promise((resolve) => {
            if (!this.process || this.process.killed) {
                this.setStatus('stopped');
                resolve();
                return;
            }
            const child = this.process;
            // Listen for the exit that should follow SIGTERM.
            const onExit = () => {
                this.clearKillTimer();
                this.process = null;
                this.setStatus('stopped');
                console.log(`[${this.name}] stopped`);
                resolve();
            };
            child.once('exit', onExit);
            // Send SIGTERM.
            console.log(`[${this.name}] sending SIGTERM`);
            child.kill('SIGTERM');
            // Fallback: if SIGTERM doesn't work, escalate to SIGKILL.
            this.killTimer = setTimeout(() => {
                if (this.process && !this.process.killed) {
                    console.log(`[${this.name}] SIGTERM timed out — sending SIGKILL`);
                    child.kill('SIGKILL');
                }
                // Absolute fallback: if even SIGKILL doesn't produce an exit event,
                // force cleanup after an additional 2 seconds.
                setTimeout(() => {
                    if (this.process) {
                        child.removeListener('exit', onExit);
                        this.process = null;
                        this.setStatus('error');
                        console.error(`[${this.name}] process did not exit after SIGKILL — forcing cleanup`);
                        resolve();
                    }
                }, 2_000);
            }, KILL_TIMEOUT_MS);
        });
    }
    /**
     * Restart the process (stop then start).
     */
    async restart() {
        await this.stop();
        this.start();
    }
    /**
     * Returns the current process status.
     */
    getStatus() {
        return this.status;
    }
    /**
     * Returns true if the process is currently running.
     */
    isRunning() {
        return this.status === 'running';
    }
    // ── Subclass hook ──────────────────────────────────────────────────
    /**
     * Override in subclasses to provide the command, args, env, and cwd
     * for the child process.  Return `null` to indicate that the process
     * cannot be started (e.g. missing config).
     */
    getSpawnOptions() {
        console.log(`[${this.name}] getSpawnOptions() not implemented`);
        return null;
    }
    /**
     * Hook called when the child process exits. Override in subclasses
     * to react to process exit (e.g. crash recovery).
     */
    onChildExit(_code, _signal) {
        // No-op by default. Subclasses can override.
    }
    // ── Internal helpers ───────────────────────────────────────────────
    /**
     * Spawn a child process with the given options and wire up event
     * handlers for stdout, stderr, exit, and error.
     */
    spawnProcess(opts) {
        const { command, args = [], env = {}, cwd, stdio } = opts;
        const mergedEnv = { ...process.env, ...env };
        console.log(`[${this.name}] spawning: ${command} ${args.join(' ')}`);
        const child = (0, node_child_process_1.spawn)(command, args, {
            env: mergedEnv,
            cwd,
            stdio: stdio ?? ['ignore', 'pipe', 'pipe'],
        });
        this.process = child;
        this.setStatus('running');
        // ── stdout ──
        child.stdout?.on('data', (chunk) => {
            const text = chunk.toString();
            this.emit('output', text, this.name);
        });
        // ── stderr ──
        child.stderr?.on('data', (chunk) => {
            const text = chunk.toString();
            console.error(`[${this.name}:stderr] ${text.trimEnd()}`);
            this.emit('error', text, this.name);
        });
        // ── exit ──
        child.on('exit', (code, signal) => {
            this.clearKillTimer();
            const reason = signal ? `signal ${signal}` : `code ${code}`;
            console.log(`[${this.name}] process exited (${reason})`);
            this.process = null;
            // If stop() was called it will handle status; otherwise mark as
            // stopped (normal exit) or error (non-zero exit).
            if (this.status === 'running') {
                this.setStatus(code === 0 || signal ? 'stopped' : 'error');
            }
            this.onChildExit(code, signal);
        });
        // ── error (failed to spawn) ──
        child.on('error', (err) => {
            console.error(`[${this.name}] spawn error:`, err.message);
            this.process = null;
            this.setStatus('error');
            this.emit('error', err.message, this.name);
        });
    }
    /**
     * Update the internal status and emit a 'status-changed' event.
     * Protected so subclasses (e.g. interval-based processes) can manage
     * their own lifecycle status.
     */
    setStatus(newStatus) {
        if (this.status === newStatus)
            return;
        const prev = this.status;
        this.status = newStatus;
        console.log(`[${this.name}] status: ${prev} -> ${newStatus}`);
        this.emit('status-changed', newStatus, this.name);
    }
    /**
     * Clear the SIGKILL fallback timer if it is active.
     */
    clearKillTimer() {
        if (this.killTimer) {
            clearTimeout(this.killTimer);
            this.killTimer = null;
        }
    }
}
exports.ProcessManager = ProcessManager;
//# sourceMappingURL=manager.js.map