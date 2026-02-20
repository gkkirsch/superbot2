# Cloudflare Workers Deployment

## Overview

Workers are serverless functions running on Cloudflare's edge network (V8 isolates). Use for API backends, middleware, cron jobs, and any compute that doesn't need a full server.

## Create a New Worker

### From template

```bash
wrangler init my-api
cd my-api
```

Choose the template when prompted (or use `--template`):
```bash
# Specific templates
wrangler init my-api --template https://github.com/cloudflare/workers-sdk/tree/main/templates/worker-typescript
```

### Manual setup

```bash
mkdir my-api && cd my-api
npm init -y
npm install --save-dev wrangler typescript @cloudflare/workers-types
```

Create `wrangler.toml`:
```toml
name = "my-api"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[build]
command = "npm run build"
```

Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

## Worker Handler Patterns

### Basic fetch handler

```ts
// src/index.ts
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/hello") {
      return Response.json({ message: "Hello!" });
    }

    return new Response("Not found", { status: 404 });
  },
};
```

### With routing (Hono framework — recommended)

Hono is the standard routing framework for Workers:

```bash
npm install hono
```

```ts
// src/index.ts
import { Hono } from "hono";
import { cors } from "hono/cors";

type Bindings = {
  DB: D1Database;
  KV: KVNamespace;
  API_KEY: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", cors());

app.get("/api/users", async (c) => {
  const result = await c.env.DB.prepare("SELECT * FROM users").all();
  return c.json(result.results);
});

app.get("/api/users/:id", async (c) => {
  const id = c.req.param("id");
  const user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
  if (!user) return c.json({ error: "Not found" }, 404);
  return c.json(user);
});

app.post("/api/users", async (c) => {
  const body = await c.req.json();
  await c.env.DB.prepare("INSERT INTO users (name, email) VALUES (?, ?)")
    .bind(body.name, body.email)
    .run();
  return c.json({ success: true }, 201);
});

export default app;
```

### Scheduled (Cron) handler

```ts
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return new Response("OK");
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Runs on cron schedule
    ctx.waitUntil(doBackgroundWork(env));
  },
};
```

Configure in `wrangler.toml`:
```toml
[triggers]
crons = ["0 */6 * * *"]  # Every 6 hours
```

### Queue handler

```ts
export default {
  async queue(batch: MessageBatch<any>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      console.log("Processing:", message.body);
      message.ack();
    }
  },
};
```

Configure in `wrangler.toml`:
```toml
[[queues.consumers]]
queue = "my-queue"
max_batch_size = 10
max_batch_timeout = 5
```

## Deploy

```bash
# Deploy to production
wrangler deploy

# Deploy to specific environment
wrangler deploy --env staging
```

## Worker Types

### Environment interface

Define your bindings in a type:

```ts
interface Env {
  // KV Namespace
  MY_KV: KVNamespace;

  // D1 Database
  DB: D1Database;

  // R2 Bucket
  BUCKET: R2Bucket;

  // Queue Producer
  MY_QUEUE: Queue;

  // Environment variables
  API_KEY: string;
  ENVIRONMENT: string;

  // Durable Object
  COUNTER: DurableObjectNamespace;
}
```

## Durable Objects

For stateful, strongly consistent compute (e.g., counters, chat rooms, game state):

```ts
export class Counter {
  private state: DurableObjectState;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    let count = (await this.state.storage.get<number>("count")) || 0;
    count++;
    await this.state.storage.put("count", count);
    return Response.json({ count });
  }
}

// In main worker:
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.COUNTER.idFromName("global");
    const stub = env.COUNTER.get(id);
    return stub.fetch(request);
  },
};
```

In `wrangler.toml`:
```toml
[durable_objects]
bindings = [
  { name = "COUNTER", class_name = "Counter" }
]

[[migrations]]
tag = "v1"
new_classes = ["Counter"]
```

## Worker Size and Bundling

- **Free plan**: 1MB after gzip
- **Paid plan**: 10MB after gzip
- Wrangler bundles with esbuild automatically
- No `node_modules` at runtime — everything is bundled

To check size:
```bash
wrangler deploy --dry-run --outdir=dist
ls -la dist/
```

If too large, consider:
- Tree-shaking unused imports
- Using lighter alternatives (e.g., `itty-router` instead of Express)
- Splitting into multiple Workers with Service Bindings

## Service Bindings (Worker-to-Worker)

Call one Worker from another without HTTP overhead:

```toml
# In calling worker's wrangler.toml
[[services]]
binding = "AUTH_SERVICE"
service = "auth-worker"
```

```ts
// In calling worker
const response = await env.AUTH_SERVICE.fetch(request);
```

## Node.js Compatibility

Enable in `wrangler.toml`:
```toml
compatibility_flags = ["nodejs_compat"]
```

This provides polyfills for common Node.js APIs (Buffer, crypto, util, etc.). Not everything works — test thoroughly.
