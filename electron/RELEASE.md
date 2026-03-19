# Superbot2 Release Process

## Prerequisites

- `gh` CLI authenticated (`gh auth status`)
- `electron-builder` installed (`npm install` in `electron/`)
- Repo is public at `github.com/your-username/superbot2`

## Steps

1. **Bump version** in `electron/package.json`:
   ```bash
   cd electron
   npm version patch  # or minor, major
   ```

2. **Build locally** to verify everything works:
   ```bash
   npm run package
   ```

3. **Publish to GitHub Releases**:
   ```bash
   npm run publish
   ```
   This sets `GH_TOKEN` from `gh auth token` and runs `electron-builder --publish always`.

4. **Verify the release** at:
   ```
   https://github.com/your-username/superbot2/releases
   ```

## What Gets Published

- `.dmg` installer (arm64)
- `.zip` archive (arm64) — required for Squirrel.Mac auto-updates
- `latest-mac.yml` — version manifest for `electron-updater`

## How Auto-Updates Work

- On startup, the app checks for updates via `electron-updater`
- Every 4 hours, a periodic check runs
- Updates download in the background
- Install happens on next app restart
- Users can also trigger a check via "Check for Updates" in the tray menu

## Notes

- No code signing configured yet — macOS may show Gatekeeper warnings
- Update channel: stable only (no beta/alpha channels)
