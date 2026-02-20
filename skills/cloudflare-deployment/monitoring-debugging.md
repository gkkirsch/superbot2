# Monitoring, Debugging, and Local Development

## Local Development with wrangler dev

### Start local dev server

```bash
# Worker
wrangler dev

# Worker with specific environment
wrangler dev --env staging

# Pages
wrangler pages dev dist/
# Or with a framework dev server:
wrangler pages dev -- npm run dev
```

### What wrangler dev provides

- Local server on `http://localhost:8787` (configurable with `--port`)
- Hot reload on file changes
- Access to bindings (KV, D1, R2) — local emulation by default
- `.dev.vars` loaded for secrets

### Local vs remote mode

```bash
# Local mode (default) — uses local emulation for bindings
wrangler dev

# Remote mode — uses real Cloudflare services (production bindings)
wrangler dev --remote
```

**Local mode** is faster and doesn't consume API quotas. Uses Miniflare under the hood.

**Remote mode** runs your Worker on Cloudflare's edge but routes requests from your local machine. Useful for testing with real data.

### Local D1

```bash
# Apply migrations locally
wrangler d1 migrations apply my-database --local

# Execute SQL locally
wrangler d1 execute my-database --local --command "SELECT * FROM users"
```

Local D1 data is stored in `.wrangler/state/` in your project.

### Local KV

Local KV works automatically in `wrangler dev`. Data persists in `.wrangler/state/`.

```bash
# Seed local KV
wrangler kv key put --namespace-id=xxx --local "key" "value"
```

### Local R2

Local R2 works automatically. Files stored in `.wrangler/state/`.

### Pages dev with framework

```bash
# Vite
wrangler pages dev -- npx vite

# Next.js
wrangler pages dev -- npx next dev

# Astro
wrangler pages dev -- npx astro dev
```

This runs both the framework dev server and Pages Functions with full binding support.

## Logging

### console.log in Workers

```ts
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    console.log("Request received:", request.url);
    console.log("Method:", request.method);
    console.log("Headers:", Object.fromEntries(request.headers));

    try {
      const result = await env.DB.prepare("SELECT * FROM users").all();
      console.log("Query result:", JSON.stringify(result));
      return Response.json(result);
    } catch (error) {
      console.error("Database error:", error);
      return new Response("Internal error", { status: 500 });
    }
  },
};
```

### Viewing logs

```bash
# Stream real-time logs from deployed worker
wrangler tail

# With filters
wrangler tail --format json
wrangler tail --status error          # Only errors
wrangler tail --method POST           # Only POST requests
wrangler tail --search "database"     # Filter by content
wrangler tail --ip self               # Only your IP

# For specific environment
wrangler tail --env staging

# For Pages Functions
wrangler pages deployment tail <deployment-id> --project-name=my-site
```

### Structured logging pattern

```ts
function log(level: string, message: string, data?: Record<string, unknown>) {
  console.log(JSON.stringify({
    level,
    message,
    timestamp: new Date().toISOString(),
    ...data,
  }));
}

// Usage
log("info", "User created", { userId: "123", email: "alice@example.com" });
log("error", "Database query failed", { query: "SELECT...", error: err.message });
```

Then filter with:
```bash
wrangler tail --format json | jq 'select(.level == "error")'
```

## Debugging

### Common debugging workflow

1. **Reproduce locally**: `wrangler dev` → hit the endpoint
2. **Check logs**: Look at console output in terminal
3. **Check real-time**: `wrangler tail` on deployed worker
4. **Inspect bindings**: Log `env` contents (but never log secrets)

### Debugging with breakpoints

Wrangler supports Chrome DevTools:

```bash
wrangler dev --inspect
```

Then open `chrome://inspect` in Chrome and connect to the Worker.

### Debugging Pages Functions

```bash
# Run Pages with Functions locally
wrangler pages dev dist/ --inspector-port 9229
```

### Common issues in local dev

| Issue | Fix |
|-------|-----|
| Port 8787 in use | `wrangler dev --port 8788` |
| Bindings not working | Check `wrangler.toml` binding names match code |
| D1 empty locally | Run `wrangler d1 migrations apply <db> --local` |
| `.dev.vars` not loading | Ensure file is in project root (same dir as `wrangler.toml`) |
| Stale local state | Delete `.wrangler/state/` and restart |

## Analytics and Metrics

### Workers Analytics (Dashboard)

Available at: https://dash.cloudflare.com → Workers & Pages → your worker → Analytics

Shows:
- Request count
- Error rate
- CPU time
- Duration (wall clock)
- Subrequest count
- Data transfer

### Workers Analytics Engine (custom metrics)

For custom analytics, use Workers Analytics Engine:

```toml
[[analytics_engine_datasets]]
binding = "ANALYTICS"
```

```ts
env.ANALYTICS.writeDataPoint({
  blobs: ["user-signup", "us-east"],
  doubles: [1],
  indexes: ["user:123"],
});
```

Query via GraphQL API or dashboard.

## Health Checks

### Simple health endpoint

```ts
app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});
```

### Health check with dependency verification

```ts
app.get("/health", async (c) => {
  const checks: Record<string, string> = {};

  try {
    await c.env.DB.prepare("SELECT 1").first();
    checks.d1 = "ok";
  } catch {
    checks.d1 = "error";
  }

  try {
    await c.env.MY_KV.get("__health");
    checks.kv = "ok";
  } catch {
    checks.kv = "error";
  }

  const allOk = Object.values(checks).every((v) => v === "ok");
  return c.json({ status: allOk ? "ok" : "degraded", checks }, allOk ? 200 : 503);
});
```

## Alerting

Configure alerts in Cloudflare dashboard → Notifications:
- Worker error rate threshold
- Worker CPU time exceeded
- Pages build failure
- D1 storage threshold

Or use the health check endpoint with an external uptime monitor (e.g., UptimeRobot, Better Uptime).
