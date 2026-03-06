import * as path from 'node:path';
import * as os from 'node:os';
import { app } from 'electron';
import { ProcessManager, type SpawnOptions } from './manager.js';

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
export class DashboardProcess extends ProcessManager {
  private readonly serverScript: string;
  private readonly apiPort: string;
  private readonly superbotHome: string;

  constructor() {
    super('dashboard');

    if (app.isPackaged) {
      this.serverScript = path.join(process.resourcesPath, 'dashboard', 'server.js');
    } else {
      // Dev mode: dist/processes/ -> dist/ -> electron/ -> superbot2/ -> dashboard/
      this.serverScript = path.resolve(
        __dirname, '..', '..', '..', 'dashboard', 'server.js',
      );
    }

    this.apiPort = process.env['SUPERBOT2_API_PORT'] ?? DEFAULT_API_PORT;
    this.superbotHome = process.env['SUPERBOT2_HOME'] ?? path.join(os.homedir(), '.superbot2');
  }

  protected override getSpawnOptions(): SpawnOptions {
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
