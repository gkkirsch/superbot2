# Multi-Chrome Instance Support

## Problem

All browser workers share one Chrome instance on CDP port 9222. When multiple workers try to automate the browser simultaneously, they conflict — opening/closing each other's tabs, fighting over page state, etc.

## Solution

Launch additional Chrome instances on separate CDP ports (9223, 9224, ...), each with their own `--user-data-dir`. Workers get assigned a unique port by the orchestrator.

## Port Allocation Strategy

| Port | Purpose | Lifecycle |
|------|---------|-----------|
| 9222 | User's main Chrome (has all logins, cookies, extensions) | Always running, never managed by scripts |
| 9223+ | Worker instances (ephemeral, clean profiles) | Launched per-worker, cleaned up when done |

**Assignment**: Simple sequential — first available port starting at 9223. The orchestrator assigns a port when spawning a worker and passes it as an environment variable (`CDP_PORT`).

**Port range**: 9223–9299 (77 worker slots, more than enough).

## Architecture

```
Orchestrator
├── Worker A → Chrome on :9223 (user-data-dir: /tmp/superbot2-chrome-9223/)
├── Worker B → Chrome on :9224 (user-data-dir: /tmp/superbot2-chrome-9224/)
└── Worker C → Chrome on :9225 (user-data-dir: /tmp/superbot2-chrome-9225/)
```

Each worker Chrome instance:
- Runs headless-new mode (no visible window needed for workers)
- Has a fresh profile (no cookies/logins — workers use OAuth when needed)
- Gets cleaned up when the worker finishes

## Scripts

### `launch-chrome-instance.sh <port>`
1. Validate port is in range 9223–9299
2. Check if port is already in use (`lsof -i :<port>`)
3. Create temp user-data-dir at `/tmp/superbot2-chrome-<port>/`
4. Launch Chrome with `--remote-debugging-port=<port> --user-data-dir=/tmp/superbot2-chrome-<port>/`
5. Wait for CDP endpoint to respond
6. Print port number on success

### `stop-chrome-instance.sh <port>`
1. Find Chrome process using that port
2. Send SIGTERM, wait, then SIGKILL if needed
3. Remove `/tmp/superbot2-chrome-<port>/` directory

### `list-chrome-instances.sh`
1. Find all Chrome processes with `--remote-debugging-port` flags
2. Display port, PID, and user-data-dir for each
3. Show which are superbot2-managed vs user's main Chrome

## Worker Usage

Workers receive their CDP port via `CDP_PORT` env var and use it for all browser commands:

```bash
# Worker browser commands
curl -s -X PUT "http://localhost:$CDP_PORT/json/new?$URL"
npx agent-browser --cdp $CDP_PORT snapshot -i
```

## Key Decisions

1. **Headless-new mode for workers**: Workers don't need visible Chrome windows. Uses `--headless=new` flag which supports full CDP.
2. **Temp user-data-dir**: Each instance gets a clean profile in /tmp. No profile sharing, no lock conflicts.
3. **Port 9222 is sacred**: Scripts never touch the user's main Chrome. Port range starts at 9223.
4. **No persistent state**: Worker Chrome instances are ephemeral. If a worker needs to log into a service, it does OAuth fresh each time.

## Tasks

1. Write plan.md (this file)
2. Implement the three scripts in `~/.superbot2/scripts/`
3. Update knowledge docs with worker CDP port instructions
