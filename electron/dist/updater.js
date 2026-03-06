"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initAutoUpdater = initAutoUpdater;
exports.checkForUpdates = checkForUpdates;
const electron_updater_1 = require("electron-updater");
const logger_js_1 = require("./logger.js");
/**
 * Initialize the auto-updater.
 *
 * Checks for updates from GitHub Releases (configured in electron-builder.yml).
 * Downloads updates in the background and installs on next app restart.
 *
 * Fails gracefully if no update server is configured or if the app
 * is not code-signed (required for macOS auto-update).
 */
function initAutoUpdater() {
    electron_updater_1.autoUpdater.logger = null;
    electron_updater_1.autoUpdater.autoDownload = true;
    electron_updater_1.autoUpdater.autoInstallOnAppQuit = true;
    electron_updater_1.autoUpdater.on('checking-for-update', () => {
        logger_js_1.logger.info('main', 'Checking for updates...');
    });
    electron_updater_1.autoUpdater.on('update-available', (info) => {
        logger_js_1.logger.info('main', `Update available: ${info.version}`);
    });
    electron_updater_1.autoUpdater.on('update-not-available', () => {
        logger_js_1.logger.info('main', 'App is up to date');
    });
    electron_updater_1.autoUpdater.on('update-downloaded', (info) => {
        logger_js_1.logger.info('main', `Update downloaded: ${info.version} — will install on restart`);
    });
    electron_updater_1.autoUpdater.on('error', (err) => {
        logger_js_1.logger.warn('main', `Auto-update error: ${err.message}`);
    });
    // Check for updates (non-blocking, fails gracefully)
    electron_updater_1.autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        logger_js_1.logger.warn('main', `Update check skipped: ${err.message}`);
    });
}
/**
 * Manually trigger an update check.
 */
function checkForUpdates() {
    electron_updater_1.autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        logger_js_1.logger.warn('main', `Update check failed: ${err.message}`);
    });
}
//# sourceMappingURL=updater.js.map