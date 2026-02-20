---
name: cloudflare-deployment
description: "Use when deploying applications to Cloudflare. Covers Pages, Workers, data services (D1, KV, R2), configuration, and migration from Heroku."
---

# Cloudflare Deployment

## Overview

Cloudflare's developer platform provides edge-first hosting and compute. Use this skill when deploying any application to Cloudflare — whether it's a static site, full-stack app, or API backend.

**Core products:**
- **Cloudflare Pages** — Static sites and full-stack apps (with Functions)
- **Cloudflare Workers** — Serverless compute at the edge (V8 isolates, not containers)
- **Data services** — D1 (SQLite), KV (key-value), R2 (object storage)

## Prerequisites: Wrangler CLI Setup

Wrangler is the CLI for all Cloudflare development and deployment.

### Install

```bash
npm install -g wrangler
```

Or use per-project:
```bash
npm install --save-dev wrangler
```

### Authenticate

```bash
wrangler login
```

This opens a browser for OAuth. After auth, credentials are stored at `~/.wrangler/config/default.toml`.

To verify:
```bash
wrangler whoami
```

### API Token (CI/CD)

For non-interactive environments (CI/CD), use an API token:

1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Create token with appropriate permissions
3. Set as environment variable:
```bash
export CLOUDFLARE_API_TOKEN=your-token-here
```

## Decision Tree: What to Deploy

```
Is it a static site or SPA (React, Vue, Astro static)?
├── YES → Cloudflare Pages (see pages-deployment.md)
│
├── Does it need server-side rendering (Next.js, Astro SSR, Nuxt)?
│   ├── YES → Cloudflare Pages with Functions (see pages-deployment.md#framework-support)
│
├── Is it an API backend or serverless function?
│   ├── YES → Cloudflare Workers (see workers-deployment.md)
│
├── Is it a full-stack app (frontend + API)?
│   ├── YES → Pages (frontend) + Workers (API) or Pages with Functions
│   │         (see pages-deployment.md#pages-functions)
│
└── Migrating from Heroku?
    └── See heroku-migration.md
```

### Quick Comparison

| Feature | Pages | Workers | Pages + Functions |
|---------|-------|---------|-------------------|
| Static sites | Yes | No | Yes |
| SSR frameworks | Via Functions | Manual | Yes |
| API endpoints | Via Functions | Yes | Yes |
| Custom build | Yes | N/A | Yes |
| Git integration | Yes | No (use CI) | Yes |
| Free tier | Unlimited sites, 500 builds/mo | 100K req/day | Combined |
| Cron triggers | No | Yes | No |
| WebSockets | No | Yes | No |
| Durable Objects | No | Yes | No |

## Supporting Guides

| Guide | When to use |
|-------|-------------|
| [pages-deployment.md](pages-deployment.md) | Deploying static sites, SPAs, or SSR apps via Pages |
| [workers-deployment.md](workers-deployment.md) | Deploying API backends, serverless functions, or cron jobs |
| [wrangler-config.md](wrangler-config.md) | wrangler.toml patterns and configuration reference |
| [data-services.md](data-services.md) | D1 (SQLite), KV (key-value), R2 (object storage) |
| [environment-secrets.md](environment-secrets.md) | Managing env vars, secrets, and multi-environment config |
| [domains-dns.md](domains-dns.md) | Custom domains, DNS setup, SSL |
| [monitoring-debugging.md](monitoring-debugging.md) | wrangler dev, wrangler tail, logs, local development |
| [troubleshooting.md](troubleshooting.md) | Common errors and fixes |
| [heroku-migration.md](heroku-migration.md) | Patterns for migrating from Heroku to Cloudflare |

## Quick Start: Deploy a Static Site in 2 Minutes

```bash
# From your project root (with build output in dist/)
npm run build
wrangler pages deploy dist/ --project-name=my-app
```

First deploy creates the project. Subsequent deploys update it.

## Quick Start: Deploy a Worker in 2 Minutes

```bash
# Create a new worker
wrangler init my-api
cd my-api

# Edit src/index.ts, then:
wrangler deploy
```

## Key Constraints to Know

- **Workers have a 1MB code size limit** (free) / 10MB (paid). No node_modules at runtime — bundle everything.
- **Workers run V8 isolates, NOT Node.js.** Most Node.js APIs are unavailable. Use Web Standard APIs (fetch, Request, Response, crypto, etc.). Node.js compat mode available but limited.
- **No persistent filesystem.** Use KV, D1, or R2 for storage.
- **CPU time limits:** 10ms (free) / 30s (paid) per request. Wall-clock time can be longer (awaiting I/O doesn't count).
- **Pages Functions** are Workers under the hood — same constraints apply to server-side code.
- **D1 is SQLite at the edge** — great for reads, writes go through a primary. Not a Postgres replacement.
