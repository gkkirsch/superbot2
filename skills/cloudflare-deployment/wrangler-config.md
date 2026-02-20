# Wrangler Configuration Reference

## Overview

`wrangler.toml` is the configuration file for Workers and Pages projects. It defines bindings, environments, build settings, and deployment targets.

## Minimal Worker Config

```toml
name = "my-worker"
main = "src/index.ts"
compatibility_date = "2024-01-01"
```

## Minimal Pages Config

```toml
name = "my-site"
pages_build_output_dir = "./dist"
```

## Full Worker Config Reference

```toml
# --- Basic ---
name = "my-worker"                    # Worker name (used in URLs and dashboard)
main = "src/index.ts"                 # Entry point
compatibility_date = "2024-01-01"     # Web platform compatibility date
compatibility_flags = ["nodejs_compat"] # Enable Node.js compat

# --- Build ---
[build]
command = "npm run build"             # Build command (optional)
cwd = "."                             # Working directory for build
watch_dir = "src"                     # Directory to watch for changes

# --- Environment Variables ---
[vars]
API_URL = "https://api.example.com"
ENVIRONMENT = "production"

# --- KV Namespaces ---
[[kv_namespaces]]
binding = "MY_KV"                     # Variable name in code
id = "abc123"                         # Namespace ID
preview_id = "def456"                 # Namespace ID for wrangler dev

# --- D1 Databases ---
[[d1_databases]]
binding = "DB"
database_name = "my-database"
database_id = "abc123"

# --- R2 Buckets ---
[[r2_buckets]]
binding = "BUCKET"
bucket_name = "my-bucket"
preview_bucket_name = "my-bucket-preview"  # For local dev

# --- Queues ---
[[queues.producers]]
queue = "my-queue"
binding = "MY_QUEUE"

[[queues.consumers]]
queue = "my-queue"
max_batch_size = 10
max_batch_timeout = 5

# --- Durable Objects ---
[durable_objects]
bindings = [
  { name = "COUNTER", class_name = "Counter" }
]

[[migrations]]
tag = "v1"
new_classes = ["Counter"]

# --- Service Bindings ---
[[services]]
binding = "AUTH"
service = "auth-worker"

# --- Cron Triggers ---
[triggers]
crons = ["0 */6 * * *", "0 0 * * MON"]

# --- Custom Routes ---
routes = [
  { pattern = "api.example.com/*", zone_name = "example.com" }
]

# --- Workers.dev subdomain ---
workers_dev = true                    # Enable *.workers.dev URL

# --- Limits ---
[limits]
cpu_ms = 50                           # CPU time limit per request (paid plans)
```

## Multi-Environment Config

Define per-environment overrides with `[env.<name>]`:

```toml
name = "my-worker"
main = "src/index.ts"
compatibility_date = "2024-01-01"

# Default (production) vars
[vars]
ENVIRONMENT = "production"
API_URL = "https://api.example.com"

# --- Staging ---
[env.staging]
name = "my-worker-staging"           # Deploys as separate worker
vars = { ENVIRONMENT = "staging", API_URL = "https://staging-api.example.com" }

[[env.staging.kv_namespaces]]
binding = "MY_KV"
id = "staging-kv-id"

# --- Development ---
[env.dev]
name = "my-worker-dev"
vars = { ENVIRONMENT = "development", API_URL = "http://localhost:3000" }
```

Deploy to environment:
```bash
wrangler deploy --env staging
```

## Pages Config with Bindings

```toml
name = "my-site"
pages_build_output_dir = "./dist"

# Bindings available in Pages Functions
[[d1_databases]]
binding = "DB"
database_name = "my-database"
database_id = "abc123"

[[kv_namespaces]]
binding = "CACHE"
id = "kv-namespace-id"

[[r2_buckets]]
binding = "UPLOADS"
bucket_name = "user-uploads"

[vars]
PUBLIC_API = "https://api.example.com"
```

## Common Patterns

### API Worker with database and cache

```toml
name = "api"
main = "src/index.ts"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

[vars]
CORS_ORIGIN = "https://mysite.com"

[[d1_databases]]
binding = "DB"
database_name = "app-db"
database_id = "..."

[[kv_namespaces]]
binding = "CACHE"
id = "..."

[env.staging]
name = "api-staging"
vars = { CORS_ORIGIN = "https://staging.mysite.com" }

[[env.staging.d1_databases]]
binding = "DB"
database_name = "app-db-staging"
database_id = "..."
```

### Static site with API Functions

```toml
name = "my-app"
pages_build_output_dir = "./dist"

[[d1_databases]]
binding = "DB"
database_name = "app-db"
database_id = "..."

[vars]
ALLOWED_ORIGIN = "https://my-app.pages.dev"
```

### Worker with cron and queue

```toml
name = "background-jobs"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[triggers]
crons = ["*/5 * * * *"]  # Every 5 minutes

[[queues.producers]]
queue = "tasks"
binding = "TASK_QUEUE"

[[queues.consumers]]
queue = "tasks"
max_batch_size = 10
max_batch_timeout = 30
max_retries = 3
dead_letter_queue = "tasks-dlq"
```

## Getting IDs for Bindings

```bash
# List KV namespaces
wrangler kv namespace list

# List D1 databases
wrangler d1 list

# List R2 buckets
wrangler r2 bucket list

# List queues
wrangler queues list
```
