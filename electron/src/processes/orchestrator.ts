import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { Notification } from 'electron';
import { ProcessManager, type SpawnOptions } from './manager.js';
import { logger } from '../logger.js';

// ── Defaults ────────────────────────────────────────────────────────────

const DEFAULT_SUPERBOT2_HOME = path.join(os.homedir(), '.superbot2');
const DEFAULT_SUPERBOT2_NAME = 'superbot2';
const INITIAL_MESSAGE = 'Begin your cycle.';
const RESTART_CHECK_INTERVAL_MS = 1_000;

// ── Crash recovery constants ─────────────────────────────────────────
const CRASH_RESTART_DELAY_MS = 5_000;
const MAX_CRASH_RESTARTS = 3;
const CRASH_WINDOW_MS = 60_000;

/**
 * Manages the Claude CLI orchestrator process.
 *
 * Replaces the core loop from the superbot2 bash launcher:
 *   - Assembles the system prompt from template + knowledge + spaces + escalations
 *   - Generates a session ID (UUID) and persists it
 *   - Spawns the `claude` CLI with agent-team flags
 *   - Supports restart via --resume with same session ID
 *   - Purges self-addressed idle notifications from team-lead inbox
 *   - Watches for a .restart flag file to trigger automatic restart
 */
export class OrchestratorProcess extends ProcessManager {
  private readonly superbotHome: string;
  private readonly superbotName: string;
  private sessionId: string | null = null;
  private isRestart = false;
  private restartWatcher: ReturnType<typeof setInterval> | null = null;
  private restartInProgress = false;

  // ── Crash recovery state ──
  private crashRecoveryEnabled = false;
  private crashTimestamps: number[] = [];
  private crashRestartTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super('orchestrator');
    this.superbotHome = process.env['SUPERBOT2_HOME'] ?? DEFAULT_SUPERBOT2_HOME;
    this.superbotName = process.env['SUPERBOT2_NAME'] ?? DEFAULT_SUPERBOT2_NAME;
  }

  // ── Public API overrides ─────────────────────────────────────────────

  /**
   * Start the orchestrator. Generates a fresh session ID, assembles the
   * prompt, purges the inbox, updates team config, and spawns claude.
   * Also starts watching for the .restart flag file.
   */
  override start(): void {
    // Generate a new session ID on first start
    if (!this.sessionId) {
      this.sessionId = crypto.randomUUID();
      this.persistSessionId();
      this.updateTeamConfig();
    }

    // Purge self-addressed idle notifications before each start
    this.purgeTeamLeadInbox();

    // Start the .restart flag file watcher
    this.startRestartWatcher();

    // Enable crash recovery
    this.crashRecoveryEnabled = true;

    logger.info('orchestrator', 'Starting');

    // Delegate to base class which calls getSpawnOptions() + spawnProcess()
    super.start();
  }

  /**
   * Stop the orchestrator. Also stops the restart watcher.
   */
  override stop(): Promise<void> {
    this.crashRecoveryEnabled = false;
    this.clearCrashRestartTimer();
    this.stopRestartWatcher();
    logger.info('orchestrator', 'Stopping');
    return super.stop();
  }

  /**
   * Restart the orchestrator with --resume using the same session ID.
   */
  override async restart(): Promise<void> {
    this.crashRecoveryEnabled = false;
    this.clearCrashRestartTimer();
    this.stopRestartWatcher();
    await super.stop();
    this.isRestart = true;
    logger.info('orchestrator', 'Restarting (resume)');
    this.start();
  }

  // ── Subclass hook ────────────────────────────────────────────────────

  /**
   * Assemble the full claude CLI spawn options.
   * The prompt is assembled fresh on every start/restart.
   */
  protected override getSpawnOptions(): SpawnOptions | null {
    const prompt = this.assemblePrompt();
    if (!prompt) {
      console.error(`[orchestrator] failed to assemble system prompt — cannot start`);
      return null;
    }

    // Capture and reset the restart flag so it doesn't persist across starts
    const shouldResume = this.isRestart;
    this.isRestart = false;

    const mpcConfigPath = path.join(this.superbotHome, 'mcp-config.json');

    const args: string[] = [
      '--system-prompt', prompt,
      '--session-id', this.sessionId!,
      '--team-name', this.superbotName,
      '--agent-name', 'team-lead',
      '--agent-id', `team-lead@${this.superbotName}`,
      '--mcp-config', mpcConfigPath,
      '--strict-mcp-config',
      '--dangerously-skip-permissions',
      '--no-chrome',
    ];

    // On restart, add --resume with same session ID
    if (shouldResume) {
      args.push('--resume', this.sessionId!);
      args.push('--', 'Session restarted with fresh context. Begin your cycle.');
    } else {
      args.push('--', INITIAL_MESSAGE);
    }

    return {
      command: 'claude',
      args,
      env: {
        CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
        ENABLE_CLAUDEAI_MCP_SERVERS: 'false',
      },
      cwd: this.superbotHome,
      stdio: ['pipe', 'pipe', 'pipe'],
    };
  }

  // ── Prompt assembly ──────────────────────────────────────────────────

  /**
   * Assemble the system prompt by reading the template file and performing
   * all substitutions, then appending knowledge, spaces, and escalations.
   *
   * Ports the bash `assemble_prompt` function to TypeScript.
   */
  private assemblePrompt(): string | null {
    const templatePath = path.join(
      this.superbotHome, 'templates', 'orchestrator-system-prompt-override.md',
    );

    if (!fs.existsSync(templatePath)) {
      console.error(`[orchestrator] template not found: ${templatePath}`);
      return null;
    }

    let prompt = fs.readFileSync(templatePath, 'utf-8');

    // ── Substitute {{IDENTITY}} ──
    const identityPath = path.join(this.superbotHome, 'IDENTITY.md');
    if (fs.existsSync(identityPath)) {
      const identity = fs.readFileSync(identityPath, 'utf-8');
      prompt = prompt.replaceAll('{{IDENTITY}}', identity);
    } else {
      prompt = prompt.replaceAll('{{IDENTITY}}', 'No identity configured yet.');
    }

    // ── Substitute {{USER}} ──
    const userPath = path.join(this.superbotHome, 'USER.md');
    if (fs.existsSync(userPath)) {
      const user = fs.readFileSync(userPath, 'utf-8');
      prompt = prompt.replaceAll('{{USER}}', user);
    } else {
      prompt = prompt.replaceAll('{{USER}}', 'No user profile configured yet.');
    }

    // ── Substitute {{MEMORY}} ──
    const memoryPath = path.join(this.superbotHome, 'MEMORY.md');
    if (fs.existsSync(memoryPath)) {
      const memory = fs.readFileSync(memoryPath, 'utf-8');
      prompt = prompt.replaceAll('{{MEMORY}}', memory);
    } else {
      prompt = prompt.replaceAll('{{MEMORY}}', 'No memory yet.');
    }

    // ── Append orchestrator guide ──
    const guidePath = path.join(this.superbotHome, 'ORCHESTRATOR_GUIDE.md');
    if (fs.existsSync(guidePath)) {
      const guide = fs.readFileSync(guidePath, 'utf-8');
      prompt += '\n\n## Orchestrator Guide\n\n';
      prompt += guide;
    }

    // ── Append knowledge files ──
    const knowledgeDir = path.join(this.superbotHome, 'knowledge');
    if (fs.existsSync(knowledgeDir)) {
      const kfiles = this.listFiles(knowledgeDir);
      if (kfiles.length > 0) {
        prompt += '\n\n## Knowledge\n';
        for (const f of kfiles) {
          const content = fs.readFileSync(f, 'utf-8');
          prompt += `\n### ${path.basename(f)}\n\n`;
          prompt += content;
        }
      }
    }

    // ── Append space configs (spaces/*/space.json) ──
    const spacesDir = path.join(this.superbotHome, 'spaces');
    if (fs.existsSync(spacesDir)) {
      const spaceDirs = fs.readdirSync(spacesDir, { withFileTypes: true })
        .filter(d => d.isDirectory());
      const spaceFiles: Array<{ slug: string; filePath: string }> = [];
      for (const d of spaceDirs) {
        const spaceJson = path.join(spacesDir, d.name, 'space.json');
        if (fs.existsSync(spaceJson)) {
          spaceFiles.push({ slug: d.name, filePath: spaceJson });
        }
      }
      if (spaceFiles.length > 0) {
        prompt += '\n\n## Spaces\n';
        for (const { slug, filePath } of spaceFiles) {
          const content = fs.readFileSync(filePath, 'utf-8');
          prompt += `\n### ${slug}\n\n\`\`\`json\n`;
          prompt += content;
          prompt += '\n```\n';
        }
      }
    }

    // ── Append pending escalations ──
    const pendingDir = path.join(this.superbotHome, 'escalations', 'pending');
    if (fs.existsSync(pendingDir)) {
      const pfiles = this.listFiles(pendingDir, '.json');
      if (pfiles.length > 0) {
        prompt += '\n\n## Pending Escalations\n';
        for (const f of pfiles) {
          const content = fs.readFileSync(f, 'utf-8');
          prompt += `\n### ${path.basename(f)}\n\n\`\`\`json\n`;
          prompt += content;
          prompt += '\n```\n';
        }
      }
    }

    // ── Append draft escalations ──
    const draftDir = path.join(this.superbotHome, 'escalations', 'draft');
    if (fs.existsSync(draftDir)) {
      const dfiles = this.listFiles(draftDir, '.json');
      if (dfiles.length > 0) {
        prompt += '\n\n## Draft Escalations\n';
        for (const f of dfiles) {
          const content = fs.readFileSync(f, 'utf-8');
          prompt += `\n### ${path.basename(f)}\n\n\`\`\`json\n`;
          prompt += content;
          prompt += '\n```\n';
        }
      }
    }

    // ── Substitute {{TEAM_NAME}} last ──
    prompt = prompt.replaceAll('{{TEAM_NAME}}', this.superbotName);

    return prompt;
  }

  // ── Session management ───────────────────────────────────────────────

  /**
   * Write the session ID to the .orchestrator-session file.
   */
  private persistSessionId(): void {
    const sessionFile = path.join(this.superbotHome, '.orchestrator-session');
    try {
      fs.writeFileSync(sessionFile, this.sessionId!, 'utf-8');
      console.log(`[orchestrator] session ID persisted: ${this.sessionId}`);
    } catch (err) {
      console.error(`[orchestrator] failed to persist session ID:`, err);
    }
  }

  /**
   * Update the team config.json with the current session ID.
   * Equivalent to: jq --arg sid "$SESSION_ID" '.leadSessionId = $sid' config.json
   */
  private updateTeamConfig(): void {
    const configPath = path.join(
      this.superbotHome, '.claude', 'teams', this.superbotName, 'config.json',
    );

    try {
      if (!fs.existsSync(configPath)) {
        console.warn(`[orchestrator] team config not found: ${configPath}`);
        return;
      }

      const raw = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(raw);
      config.leadSessionId = this.sessionId;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
      console.log(`[orchestrator] team config updated with session ID`);
    } catch (err) {
      console.error(`[orchestrator] failed to update team config:`, err);
    }
  }

  // ── Inbox purge ──────────────────────────────────────────────────────

  /**
   * Purge self-addressed idle notifications from the team-lead inbox.
   * Equivalent to the bash jq filter:
   *   [.[] | select(.from != "team-lead" or ((.text // "") | test("idle_notification") | not))]
   */
  private purgeTeamLeadInbox(): void {
    const inboxPath = path.join(
      this.superbotHome, '.claude', 'teams', this.superbotName, 'inboxes', 'team-lead.json',
    );

    try {
      if (!fs.existsSync(inboxPath)) {
        console.log(`[orchestrator] no team-lead inbox found — skipping purge`);
        return;
      }

      const raw = fs.readFileSync(inboxPath, 'utf-8');
      const messages: Array<{ from?: string; text?: string; [key: string]: unknown }> = JSON.parse(raw);

      if (!Array.isArray(messages)) {
        console.warn(`[orchestrator] inbox is not an array — skipping purge`);
        return;
      }

      const filtered = messages.filter((msg) => {
        // Keep messages that are NOT (from team-lead AND containing idle_notification)
        if (msg.from !== 'team-lead') return true;
        const text = msg.text ?? '';
        return !text.includes('idle_notification');
      });

      const removed = messages.length - filtered.length;
      if (removed > 0) {
        fs.writeFileSync(inboxPath, JSON.stringify(filtered), 'utf-8');
        console.log(`[orchestrator] purged ${removed} self-addressed idle notification(s) from inbox`);
      }
    } catch (err) {
      console.error(`[orchestrator] failed to purge inbox:`, err);
    }
  }

  // ── .restart flag file watcher ───────────────────────────────────────

  /**
   * Start polling for the .restart flag file.
   * When found, delete it and restart the orchestrator.
   */
  private startRestartWatcher(): void {
    this.stopRestartWatcher();

    const restartFlagPath = path.join(this.superbotHome, '.restart');

    this.restartWatcher = setInterval(() => {
      try {
        if (fs.existsSync(restartFlagPath) && !this.restartInProgress) {
          console.log(`[orchestrator] .restart flag detected — restarting`);
          this.restartInProgress = true;
          // Remove the flag file first to prevent re-triggering
          fs.unlinkSync(restartFlagPath);
          // Trigger restart (async, fire-and-forget from interval)
          void this.restart().finally(() => { this.restartInProgress = false; });
        }
      } catch (err) {
        console.error(`[orchestrator] error checking .restart flag:`, err);
      }
    }, RESTART_CHECK_INTERVAL_MS);
  }

  /**
   * Stop the .restart flag file watcher.
   */
  private stopRestartWatcher(): void {
    if (this.restartWatcher) {
      clearInterval(this.restartWatcher);
      this.restartWatcher = null;
    }
  }

  // ── Crash recovery ──────────────────────────────────────────────────

  /**
   * React to child process exit. If crash recovery is enabled and the
   * exit was unexpected (non-zero, not a signal from stop()), schedule
   * an automatic restart.
   */
  protected override onChildExit(code: number | null, _signal: string | null): void {
    if (!this.crashRecoveryEnabled) return;
    if (code === 0 || code === null) return;

    const now = Date.now();

    // Prune timestamps outside the window
    this.crashTimestamps = this.crashTimestamps.filter(
      t => now - t < CRASH_WINDOW_MS,
    );
    this.crashTimestamps.push(now);

    const attempt = this.crashTimestamps.length;
    logger.error(
      'watchdog',
      `Orchestrator crashed (exit code ${code}). ` +
      `Restart attempt ${attempt}/${MAX_CRASH_RESTARTS}`,
    );

    if (attempt >= MAX_CRASH_RESTARTS) {
      logger.error('watchdog', 'Max restart attempts reached within 60s. Giving up.');
      this.crashRecoveryEnabled = false;
      new Notification({
        title: 'Superbot2',
        body: 'Orchestrator crashed repeatedly. Automatic restart disabled.',
      }).show();
      return;
    }

    // Schedule restart after delay
    logger.info('watchdog', `Scheduling auto-restart in ${CRASH_RESTART_DELAY_MS / 1000}s...`);
    this.crashRestartTimer = setTimeout(() => {
      if (!this.crashRecoveryEnabled) return;
      logger.info('watchdog', 'Auto-restarting orchestrator after crash');
      this.isRestart = true;
      this.start();
    }, CRASH_RESTART_DELAY_MS);
  }

  private clearCrashRestartTimer(): void {
    if (this.crashRestartTimer) {
      clearTimeout(this.crashRestartTimer);
      this.crashRestartTimer = null;
    }
  }

  // ── File helpers ─────────────────────────────────────────────────────

  /**
   * List regular files in a directory, optionally filtered by extension.
   * Returns full paths sorted by name.
   */
  private listFiles(dir: string, ext?: string): string[] {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      return entries
        .filter(e => e.isFile() && (!ext || e.name.endsWith(ext)))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(e => path.join(dir, e.name));
    } catch {
      return [];
    }
  }
}
