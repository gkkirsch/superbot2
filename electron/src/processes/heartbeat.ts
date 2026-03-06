import { ChildProcess, spawn } from 'node:child_process';
import * as path from 'node:path';
import * as os from 'node:os';
import { app } from 'electron';
import { ProcessManager } from './manager.js';
import { logger } from '../logger.js';

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
export class HeartbeatProcess extends ProcessManager {
  private readonly scriptPath: string;
  private readonly superbotHome: string;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private activeChild: ChildProcess | null = null;

  constructor() {
    super('heartbeat');

    if (app.isPackaged) {
      this.scriptPath = path.join(process.resourcesPath, 'scripts', 'heartbeat-cron.sh');
    } else {
      this.scriptPath = path.resolve(
        __dirname, '..', '..', '..', 'scripts', 'heartbeat-cron.sh',
      );
    }

    this.superbotHome = process.env['SUPERBOT2_HOME'] ?? path.join(os.homedir(), '.superbot2');
  }

  override start(): void {
    if (this.intervalTimer) return;

    logger.info('heartbeat', 'Started (interval: 30min)');
    this.setStatus('running');

    // Run immediately, then on interval
    this.runOnce();
    this.intervalTimer = setInterval(() => this.runOnce(), HEARTBEAT_INTERVAL_MS);
  }

  override stop(): Promise<void> {
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
    logger.info('heartbeat', 'Stopped');
    return Promise.resolve();
  }

  private runOnce(): void {
    // Skip if a previous run is still going
    if (this.activeChild) return;

    const child = spawn('bash', [this.scriptPath], {
      env: {
        ...process.env,
        SUPERBOT2_HOME: this.superbotHome,
        SUPERBOT2_NAME: process.env['SUPERBOT2_NAME'] ?? 'superbot2',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.activeChild = child;

    child.stderr?.on('data', (chunk: Buffer) => {
      logger.warn('heartbeat', chunk.toString().trimEnd());
    });

    child.on('exit', (code) => {
      this.activeChild = null;
      if (code !== 0 && code !== null) {
        logger.error('heartbeat', `Script exited with code ${code}`);
      }
    });

    child.on('error', (err) => {
      this.activeChild = null;
      logger.error('heartbeat', `Spawn error: ${err.message}`);
      this.setStatus('error');
    });
  }
}
