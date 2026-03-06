"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvedNodePath = exports.resolveNodePath = exports.getEnrichedPath = void 0;
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const child_process = require("node:child_process");
// ── Common node binary locations (checked in order) ──────────────────
const HOME = os.homedir();
const CANDIDATE_PATHS = [
    path.join(HOME, '.asdf', 'shims', 'node'),
    path.join(HOME, '.nvm', 'current', 'bin', 'node'),
    '/opt/homebrew/bin/node',
    '/usr/local/bin/node',
    '/usr/bin/node',
];
// ── Extra PATH directories to include ────────────────────────────────
const EXTRA_PATH_DIRS = [
    path.join(HOME, '.asdf', 'shims'),
    path.join(HOME, '.asdf', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
];
/**
 * Build an enriched PATH that includes common binary locations.
 * This ensures packaged Electron apps can find node, claude, bash, etc.
 * even when launched from macOS Finder (which uses a minimal PATH).
 */
function getEnrichedPath() {
    const currentPath = process.env['PATH'] ?? '';
    const currentDirs = new Set(currentPath.split(':').filter(Boolean));
    // Also try to discover nvm's current node bin directory
    const nvmDir = process.env['NVM_DIR'] ?? path.join(HOME, '.nvm');
    try {
        // Find the highest version directory under nvm
        const versionsDir = path.join(nvmDir, 'versions', 'node');
        if (fs.existsSync(versionsDir)) {
            const versions = fs.readdirSync(versionsDir).sort().reverse();
            if (versions.length > 0) {
                const nvmBin = path.join(versionsDir, versions[0], 'bin');
                if (fs.existsSync(nvmBin)) {
                    EXTRA_PATH_DIRS.unshift(nvmBin);
                }
            }
        }
    }
    catch { /* ignore */ }
    // Add extra dirs that aren't already in PATH
    const additions = [];
    for (const dir of EXTRA_PATH_DIRS) {
        if (!currentDirs.has(dir) && fs.existsSync(dir)) {
            additions.push(dir);
        }
    }
    if (additions.length > 0) {
        return [...additions, currentPath].join(':');
    }
    return currentPath;
}
exports.getEnrichedPath = getEnrichedPath;
/**
 * Resolve the absolute path to the `node` binary.
 *
 * Strategy:
 * 1. Try `which node` via a login shell (picks up .zshrc / .bashrc)
 * 2. Check well-known candidate paths
 * 3. Fall back to 'node' (bare command) as last resort
 */
function resolveNodePath() {
    // Strategy 1: Ask the user's login shell
    try {
        const shell = process.env['SHELL'] ?? '/bin/zsh';
        const result = child_process.execSync(
            `${shell} -ilc 'which node' 2>/dev/null`,
            { timeout: 5000, encoding: 'utf-8' }
        );
        const resolved = result.trim();
        if (resolved && fs.existsSync(resolved)) {
            console.log(`[resolve-node] found via login shell: ${resolved}`);
            return resolved;
        }
    }
    catch { /* ignore — shell may not be available */ }
    // Strategy 2: Check well-known paths
    for (const candidate of CANDIDATE_PATHS) {
        try {
            if (fs.existsSync(candidate)) {
                // Verify it's actually executable
                fs.accessSync(candidate, fs.constants.X_OK);
                console.log(`[resolve-node] found at candidate path: ${candidate}`);
                return candidate;
            }
        }
        catch { /* not accessible, try next */ }
    }
    // Strategy 3: Bare fallback
    console.warn(`[resolve-node] could not resolve absolute node path — falling back to 'node'`);
    return 'node';
}
exports.resolveNodePath = resolveNodePath;
/**
 * Pre-resolved node path (computed once at module load time).
 */
exports.resolvedNodePath = resolveNodePath();
//# sourceMappingURL=resolve-node.js.map
