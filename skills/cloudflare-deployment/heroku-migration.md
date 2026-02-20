# Migration from Heroku to Cloudflare

## Overview

Heroku and Cloudflare have fundamentally different architectures. This guide maps Heroku concepts to Cloudflare equivalents and provides migration patterns.

## Concept Mapping

| Heroku | Cloudflare | Notes |
|--------|------------|-------|
| Dyno (web) | Worker or Pages Function | V8 isolates, not containers |
| Dyno (worker) | Worker with Queue consumer | Or cron-triggered Worker |
| Heroku Postgres | D1 (SQLite) | Not a drop-in replacement — see database section |
| Heroku Redis | KV (simple) or Durable Objects (complex) | KV is eventually consistent |
| Heroku Config Vars | Secrets + vars | `wrangler secret put` + `wrangler.toml` vars |
| Procfile | wrangler.toml | Defines worker entry point and triggers |
| Review Apps | Pages Preview Deployments | Automatic per-branch deployments |
| Heroku Pipelines | Wrangler environments | staging/production in wrangler.toml |
| Add-ons | Cloudflare services + external APIs | D1, KV, R2, Queues, etc. |
| Custom domains | Custom domains/routes | See domains-dns.md |
| Heroku CLI | Wrangler CLI | `wrangler deploy`, `wrangler tail`, etc. |

## Migration Patterns

### Pattern 1: Express API → Hono Worker

**Before (Heroku/Express):**
```ts
// server.js
const express = require("express");
const app = express();

app.use(express.json());

app.get("/api/users", async (req, res) => {
  const users = await db.query("SELECT * FROM users");
  res.json(users);
});

app.post("/api/users", async (req, res) => {
  const { name, email } = req.body;
  await db.query("INSERT INTO users (name, email) VALUES ($1, $2)", [name, email]);
  res.status(201).json({ success: true });
});

app.listen(process.env.PORT || 3000);
```

**After (Cloudflare/Hono):**
```ts
// src/index.ts
import { Hono } from "hono";
import { cors } from "hono/cors";

type Bindings = { DB: D1Database };

const app = new Hono<{ Bindings: Bindings }>();
app.use("*", cors());

app.get("/api/users", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM users").all();
  return c.json(results);
});

app.post("/api/users", async (c) => {
  const { name, email } = await c.req.json();
  await c.env.DB.prepare("INSERT INTO users (name, email) VALUES (?, ?)")
    .bind(name, email)
    .run();
  return c.json({ success: true }, 201);
});

export default app;
```

**Key changes:**
- Express → Hono (Workers-native framework)
- `process.env` → `c.env` (bindings)
- Postgres `$1, $2` → D1 `?, ?` with `.bind()`
- No `app.listen()` — Workers handle this automatically

### Pattern 2: React SPA + Express API → Pages + Worker

**Before (Heroku):**
```
my-app/
├── client/          # React SPA
├── server/          # Express API
├── Procfile         # web: node server/index.js
└── package.json
```

**After (Cloudflare):**

Split into two projects:

**Frontend (Pages):**
```
my-app-web/
├── src/             # React SPA
├── dist/            # Build output
├── wrangler.toml    # pages_build_output_dir = "./dist"
└── package.json
```

**API (Worker):**
```
my-app-api/
├── src/index.ts     # Hono API
├── wrangler.toml    # Worker config with D1, KV bindings
└── package.json
```

Or use **Pages with Functions** (single project):
```
my-app/
├── src/             # React SPA
├── functions/       # API routes (Pages Functions)
│   └── api/
│       ├── users/
│       │   ├── index.ts
│       │   └── [id].ts
│       └── _middleware.ts
├── dist/            # Build output
├── wrangler.toml
└── package.json
```

### Pattern 3: Background Jobs (Heroku Worker Dyno → Cloudflare Queue)

**Before (Heroku):**
```
# Procfile
web: node server.js
worker: node jobs/worker.js
```

**After (Cloudflare):**

```toml
# wrangler.toml
name = "my-api"
main = "src/index.ts"

[[queues.producers]]
queue = "jobs"
binding = "JOB_QUEUE"

[[queues.consumers]]
queue = "jobs"
max_batch_size = 10
max_batch_timeout = 30
```

```ts
// src/index.ts
export default {
  // HTTP handler enqueues jobs
  async fetch(request: Request, env: Env): Promise<Response> {
    await env.JOB_QUEUE.send({
      type: "send-email",
      to: "user@example.com",
      template: "welcome",
    });
    return Response.json({ queued: true });
  },

  // Queue consumer processes jobs
  async queue(batch: MessageBatch<Job>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      switch (message.body.type) {
        case "send-email":
          await sendEmail(message.body, env);
          break;
        // ... other job types
      }
      message.ack();
    }
  },
};
```

### Pattern 4: Cron Jobs (Heroku Scheduler → Workers Cron)

**Before (Heroku Scheduler):**
```bash
# Runs every 10 minutes
node scripts/cleanup.js
```

**After (Cloudflare):**
```toml
[triggers]
crons = ["*/10 * * * *"]
```

```ts
export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    await cleanup(env);
  },
};
```

## Database Migration: Postgres → D1

### Key differences

| Feature | Heroku Postgres | D1 (SQLite) |
|---------|-----------------|-------------|
| Engine | PostgreSQL | SQLite |
| Concurrent connections | Pool-based | Per-request (no pool needed) |
| JSON | `JSONB` type | `TEXT` + `json()` functions |
| Auto-increment | `SERIAL` | `INTEGER PRIMARY KEY AUTOINCREMENT` |
| Booleans | `BOOLEAN` | `INTEGER` (0/1) |
| Date/time | `TIMESTAMP` | `TEXT` (ISO 8601 strings) |
| Full-text search | Built-in tsvector | SQLite FTS5 |
| Max size | Plan-dependent | 1GB per database |

### SQL translation examples

```sql
-- Postgres
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  metadata JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- D1 (SQLite)
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  metadata TEXT DEFAULT '{}',
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### Migration steps

1. **Export from Heroku Postgres:**
```bash
pg_dump --data-only --inserts DATABASE_URL > data.sql
```

2. **Convert SQL syntax** (Postgres → SQLite):
   - Remove `::type` casts
   - Replace `true/false` with `1/0`
   - Replace `NOW()` with `datetime('now')`
   - Replace `SERIAL` with `INTEGER PRIMARY KEY AUTOINCREMENT`
   - Replace `JSONB` with `TEXT`
   - Remove `ON CONFLICT` clauses (D1 supports basic `ON CONFLICT` but syntax differs)

3. **Create D1 database and apply schema:**
```bash
wrangler d1 create my-database
wrangler d1 execute my-database --remote --file schema.sql
```

4. **Import data:**
```bash
wrangler d1 execute my-database --remote --file data.sql
```

### When D1 isn't enough

If your app heavily relies on PostgreSQL features (complex joins, CTEs, window functions, full-text search), consider:
- **Neon** or **Supabase** — Postgres-compatible, accessible from Workers via HTTP
- **PlanetScale** — MySQL-compatible, HTTP API
- Keep Postgres externally and call via `fetch()` from your Worker

## Environment Variables Migration

```bash
# Export from Heroku
heroku config -s --app my-app > heroku-env.txt

# For each non-secret variable, add to wrangler.toml [vars]
# For each secret, use:
wrangler secret put VAR_NAME
# Then paste the value
```

## Checklist

- [ ] Map Heroku add-ons to Cloudflare equivalents
- [ ] Migrate database schema and data
- [ ] Convert Express/Node.js code to Workers-compatible code
- [ ] Replace `process.env` with `env` bindings
- [ ] Set up secrets and environment variables
- [ ] Test locally with `wrangler dev`
- [ ] Deploy to staging environment first
- [ ] Set up custom domains
- [ ] Configure monitoring (wrangler tail)
- [ ] Update CI/CD pipeline
- [ ] Set up DNS cutover plan
- [ ] Verify SSL/TLS configuration
- [ ] Test with production traffic (use Cloudflare load balancing for gradual cutover)
