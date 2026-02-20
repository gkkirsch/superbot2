# Environment Variables and Secrets

## Overview

Cloudflare has two types of configuration values:
- **Variables (`vars`)** — Non-sensitive config, stored in `wrangler.toml`, visible in plaintext
- **Secrets** — Sensitive values (API keys, tokens), encrypted at rest, NOT in `wrangler.toml`

## Variables (Non-Sensitive)

### In wrangler.toml

```toml
[vars]
API_URL = "https://api.example.com"
ENVIRONMENT = "production"
MAX_RETRIES = "3"
```

### Per environment

```toml
[vars]
ENVIRONMENT = "production"
API_URL = "https://api.example.com"

[env.staging.vars]
ENVIRONMENT = "staging"
API_URL = "https://staging-api.example.com"

[env.dev.vars]
ENVIRONMENT = "development"
API_URL = "http://localhost:3000"
```

### Access in code

```ts
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    console.log(env.API_URL);        // "https://api.example.com"
    console.log(env.ENVIRONMENT);    // "production"
    return new Response("OK");
  },
};
```

## Secrets (Sensitive)

### Set secrets via CLI

```bash
# Interactive (prompts for value — preferred, avoids shell history)
wrangler secret put API_KEY

# From stdin
echo "sk-abc123" | wrangler secret put API_KEY

# For specific environment
wrangler secret put API_KEY --env staging
```

### List secrets

```bash
wrangler secret list
```

### Delete secrets

```bash
wrangler secret delete API_KEY
```

### Secrets in Pages

```bash
# Set for production
wrangler pages secret put API_KEY --project-name=my-site

# Set for preview
wrangler pages secret put API_KEY --project-name=my-site --env preview
```

Or via dashboard: Project → Settings → Environment variables → Add variable → Encrypt.

### Access in code

Secrets are accessed the same way as variables — via `env`:

```ts
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Secret — set via `wrangler secret put`
    const apiKey = env.API_KEY;

    // Variable — set in wrangler.toml
    const apiUrl = env.API_URL;

    const response = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    return new Response(await response.text());
  },
};
```

## .dev.vars (Local Development)

For local development with `wrangler dev`, create a `.dev.vars` file in your project root:

```
# .dev.vars — NOT committed to git
API_KEY=sk-local-dev-key
DATABASE_URL=postgres://localhost:5432/mydb
STRIPE_SECRET=sk_test_xxx
```

**Add to `.gitignore`:**
```
.dev.vars
```

These values are injected into `env` during `wrangler dev` and override `wrangler.toml` vars.

## Environment Patterns

### Three-environment setup

```toml
# wrangler.toml
name = "my-api"
main = "src/index.ts"
compatibility_date = "2024-01-01"

# Production (default)
[vars]
ENVIRONMENT = "production"
LOG_LEVEL = "error"

[[d1_databases]]
binding = "DB"
database_name = "app-db"
database_id = "prod-db-id"

# --- Staging ---
[env.staging]
name = "my-api-staging"

[env.staging.vars]
ENVIRONMENT = "staging"
LOG_LEVEL = "debug"

[[env.staging.d1_databases]]
binding = "DB"
database_name = "app-db-staging"
database_id = "staging-db-id"

# --- Dev ---
[env.dev]
name = "my-api-dev"

[env.dev.vars]
ENVIRONMENT = "development"
LOG_LEVEL = "debug"
```

Then set secrets per environment:
```bash
wrangler secret put API_KEY               # production
wrangler secret put API_KEY --env staging  # staging
```

Deploy per environment:
```bash
wrangler deploy              # production
wrangler deploy --env staging  # staging
```

### CI/CD environment variables

In your CI pipeline, set:

```bash
# Required
export CLOUDFLARE_API_TOKEN=your-api-token

# Optional — if account has multiple zones
export CLOUDFLARE_ACCOUNT_ID=your-account-id
```

Then secrets can be managed via the Wrangler CLI in CI:
```bash
echo "$PROD_API_KEY" | wrangler secret put API_KEY
echo "$PROD_DB_KEY" | wrangler secret put DATABASE_KEY
wrangler deploy
```

## Security Best Practices

1. **Never put secrets in `wrangler.toml`** — use `wrangler secret put` or the dashboard
2. **Never commit `.dev.vars`** — add to `.gitignore`
3. **Use separate secrets per environment** — production and staging should have different API keys
4. **Rotate secrets regularly** — `wrangler secret put` replaces the existing value
5. **Use API tokens (not global API key)** for CI/CD — scope permissions narrowly
6. **Audit secret access** — check Cloudflare audit logs for when secrets are read/updated
