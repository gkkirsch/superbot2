# Custom Domains and DNS

## Overview

Cloudflare can serve your Workers and Pages projects on custom domains. Setup varies depending on whether your domain's DNS is already on Cloudflare.

## Pages Custom Domains

### Add a custom domain

1. **Dashboard**: Pages project → Custom domains → Set up a custom domain
2. Enter your domain (e.g., `myapp.example.com`)
3. Cloudflare creates the DNS record automatically if the zone is on Cloudflare

### CLI (alternative)

Custom domain management for Pages is primarily done through the dashboard.

### Apex domain (example.com) vs subdomain (app.example.com)

Both work. For apex domains, Cloudflare uses CNAME flattening automatically.

## Workers Custom Domains

### Method 1: Custom Domains (recommended)

In `wrangler.toml`:
```toml
# Use custom domain (Cloudflare manages DNS record)
routes = [
  { pattern = "api.example.com", custom_domain = true }
]
```

Or via CLI:
```bash
wrangler deploy  # with routes in wrangler.toml
```

### Method 2: Route Patterns

```toml
# Match specific paths on an existing zone
routes = [
  { pattern = "example.com/api/*", zone_name = "example.com" },
  { pattern = "example.com/webhooks/*", zone_name = "example.com" }
]
```

### Method 3: workers.dev subdomain

Every Worker gets a free `*.workers.dev` URL:
```toml
workers_dev = true  # Enabled by default
```

Your Worker is at: `my-worker.your-subdomain.workers.dev`

## DNS Setup

### If domain is already on Cloudflare

No extra DNS setup needed. Custom domains and route patterns work directly.

### If domain is NOT on Cloudflare

You need to move your domain's nameservers to Cloudflare:

1. Add domain in Cloudflare dashboard
2. Cloudflare scans existing DNS records
3. Update nameservers at your registrar to the ones Cloudflare provides
4. Wait for propagation (usually minutes, up to 48 hours)

### Manual DNS records

If you need to set up DNS records manually:

```bash
# A record (rarely needed — custom domains handle this)
# CNAME for Pages
Type: CNAME
Name: myapp
Target: my-project.pages.dev
Proxy: Yes (orange cloud)

# For Workers — use custom_domain in wrangler.toml instead
```

## SSL/TLS

### Automatic SSL

Cloudflare provides free SSL certificates automatically for:
- `*.pages.dev` domains
- `*.workers.dev` domains
- Any custom domain proxied through Cloudflare

No configuration needed. Certificates are issued and renewed automatically.

### SSL modes

Set in Cloudflare dashboard → SSL/TLS:

| Mode | Description | When to use |
|------|-------------|-------------|
| **Full (Strict)** | Encrypts end-to-end, validates origin cert | Production (recommended) |
| **Full** | Encrypts end-to-end, no origin cert validation | When origin has self-signed cert |
| **Flexible** | Encrypts client→Cloudflare only | Avoid — origin traffic is unencrypted |

For Workers and Pages, the "origin" is Cloudflare itself, so SSL mode primarily matters when Workers proxy to external backends.

## Multi-Domain Setup

### Pages with multiple domains

Add multiple custom domains in the dashboard. All point to the same deployment.

### Workers with multiple routes

```toml
routes = [
  { pattern = "api.example.com/*", custom_domain = true },
  { pattern = "api.example.org/*", custom_domain = true },
  { pattern = "example.com/api/*", zone_name = "example.com" }
]
```

### Redirect www to apex (or vice versa)

Use a redirect rule in Cloudflare dashboard (Rules → Redirect Rules) or a Worker:

```ts
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname === "www.example.com") {
      url.hostname = "example.com";
      return Response.redirect(url.toString(), 301);
    }
    // ... normal handler
  },
};
```

## Common Patterns

### Frontend (Pages) + API (Workers) on same domain

```
example.com          → Pages (static site)
example.com/api/*    → Worker (API)
```

Set up the Worker route on the same zone:
```toml
# Worker wrangler.toml
routes = [
  { pattern = "example.com/api/*", zone_name = "example.com" }
]
```

Pages serves everything else. Worker routes take priority for matching paths.

### Subdomain per service

```
example.com       → Pages (marketing site)
app.example.com   → Pages (web app)
api.example.com   → Worker (API)
```

Each service has its own custom domain configured independently.
