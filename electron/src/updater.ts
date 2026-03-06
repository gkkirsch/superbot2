import { autoUpdater } from 'electron-updater';
import { logger } from './logger.js';

/**
 * Initialize the auto-updater.
 *
 * Checks for updates from GitHub Releases (configured in electron-builder.yml).
 * Downloads updates in the background and installs on next app restart.
 *
 * Fails gracefully if no update server is configured or if the app
 * is not code-signed (required for macOS auto-update).
 */
export function initAutoUpdater(): void {
  autoUpdater.logger = null;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    logger.info('main', 'Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    logger.info('main', `Update available: ${info.version}`);
  });

  autoUpdater.on('update-not-available', () => {
    logger.info('main', 'App is up to date');
  });

  autoUpdater.on('update-downloaded', (info) => {
    logger.info('main', `Update downloaded: ${info.version} — will install on restart`);
  });

  autoUpdater.on('error', (err) => {
    logger.warn('main', `Auto-update error: ${err.message}`);
  });

  // Check for updates (non-blocking, fails gracefully)
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    logger.warn('main', `Update check skipped: ${err.message}`);
  });
}

/**
 * Manually trigger an update check.
 */
export function checkForUpdates(): void {
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    logger.warn('main', `Update check failed: ${err.message}`);
  });
}
