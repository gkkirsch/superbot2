import { ChildProcess, spawn } from 'node:child_process';
import * as path from 'node:path';
import * as os from 'node:os';
import { app } from 'electron';
import { ProcessManager } from './manager.js';
import { logger } from '../logger.js';

/** Run scheduler every 60 seconds. */
const SCHEDULER_INTERVAL_MS = 60 * 1000;

/**
 * Manages the job scheduler process.
 *
 * Interval-based: spawns scheduler.sh every 60 seconds to check
 * for due scheduled jobs. The process is considered "running" as
 * long as the interval is active.
 */
export class SchedulerProcess extends ProcessManager {
  private readonly scriptPath: string;
  private readonly superbotHome: string;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private activeChild: ChildProcess | null = null;

  constructor() {
    super('scheduler');

    if (app.isPackaged) {
      this.scriptPath = path.join(process.resourcesPath, 'scripts', 'scheduler.sh');
    } else {
      this.scriptPath = path.resolve(
        __dirname, '..', '..', '..', 'scripts', 'scheduler.sh',
      );
    }

    this.superbotHome = process.env['SUPERBOT2_HOME'] ?? path.join(os.homedir(), '.superbot2');
  }

  override start(): void {
    if (this.intervalTimer) return;

    logger.info('scheduler', 'Started (interval: 60s)');
    this.setStatus('running');

    // Run immediately, then on interval
    this.runOnce();
    this.intervalTimer = setInterval(() => this.runOnce(), SCHEDULER_INTERVAL_MS);
  }

  override stop(): Promise<void> {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }

    if (this.activeChild && !this.activeChild.killed) {
      this.activeChild.kill('SIGTERM');
    }
    this.activeChild = null;

    this.setStatus('stopped');
    logger.info('scheduler', 'Stopped');
    return Promise.resolve();
  }

  private runOnce(): void {
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
      logger.warn('scheduler', chunk.toString().trimEnd());
    });

    child.on('exit', (code) => {
      this.activeChild = null;
      if (code !== 0 && code !== null) {
        logger.error('scheduler', `Script exited with code ${code}`);
      }
    });

    child.on('error', (err) => {
      this.activeChild = null;
      logger.error('scheduler', `Spawn error: ${err.message}`);
      this.setStatus('error');
    });
  }
}
