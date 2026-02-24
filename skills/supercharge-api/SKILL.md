---
name: supercharge-api
description: "Use when interacting with the superchargeclaudecode.com platform API. Covers auth, plugin management, marketplace operations, and deployment."
credentials:
  - key: SUPERCHARGE_EMAIL
    label: "Supercharge Claude Code Email"
    description: "Your account email at superchargeclaudecode.com"
    required: true
  - key: SUPERCHARGE_PASSWORD
    label: "Supercharge Claude Code Password"
    description: "Your account password at superchargeclaudecode.com"
    required: true
---

# Supercharge Claude Code API

Reference for the superchargeclaudecode.com platform API.

## Authentication

> **Gotcha**: Auth endpoints use `/auth/` prefix, NOT `/api/auth/`. This is a common mistake.

### Login

```bash
curl -X POST https://superchargeclaudecode.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "your-email@example.com", "password": "<password>"}'
```

Response includes a JWT token. Use it for all authenticated requests:

```
Authorization: Bearer <token>
```

### Signup

```bash
curl -X POST https://superchargeclaudecode.com/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "...", "name": "..."}'
```

### Admin Password Reset

For admin use only. Requires the `ADMIN_SECRET` env var value.

```bash
curl -X POST https://superchargeclaudecode.com/auth/reset-password \
  -H "X-Admin-Secret: <admin-secret>" \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "newPassword": "newpassword123"}'
```

## Account

- Use your registered account email for authenticated API requests

## Plugins

### List All Plugins (public)

```bash
curl https://superchargeclaudecode.com/api/plugins
```

### Get Single Plugin (public)

```bash
curl https://superchargeclaudecode.com/api/plugins/:name
```

### Full Marketplace Listing (public)

Returns all approved plugins (85+) in standard marketplace.json format.

```bash
curl https://superchargeclaudecode.com/api/marketplaces/supercharge-claude-code/marketplace.json
```

### Import Plugin from GitHub (auth required)

```bash
curl -X POST https://superchargeclaudecode.com/api/plugins/import-url \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://github.com/user/repo"}'
```

## Custom Marketplaces

### List Your Marketplaces (auth required)

```bash
curl https://superchargeclaudecode.com/marketplaces \
  -H "Authorization: Bearer <token>"
```

### Create Marketplace (auth required)

```bash
curl -X POST https://superchargeclaudecode.com/marketplaces \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "My Marketplace", "slug": "my-marketplace", "description": "..."}'
```

### Get Marketplace by Slug (public)

```bash
curl https://superchargeclaudecode.com/api/marketplaces/:slug
```

Public page served at `/m/:slug`.

### Update Marketplace (auth required)

```bash
curl -X PUT https://superchargeclaudecode.com/marketplaces/:id \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Updated Name", "description": "..."}'
```

### Delete Marketplace (auth required)

```bash
curl -X DELETE https://superchargeclaudecode.com/marketplaces/:id \
  -H "Authorization: Bearer <token>"
```

### Add Plugin to Marketplace (auth required)

```bash
curl -X POST https://superchargeclaudecode.com/marketplaces/:id/plugins \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"pluginId": "<plugin-id>", "category": "Marketing"}'
```

The `category` field is optional. Used for per-plugin categorization within a marketplace.

### Remove Plugin from Marketplace (auth required)

```bash
curl -X DELETE https://superchargeclaudecode.com/marketplaces/:id/plugins/:pluginId \
  -H "Authorization: Bearer <token>"
```

### Marketplace JSON (public)

Standard marketplace.json format compatible with `claude plugin marketplace add`.

```bash
curl https://superchargeclaudecode.com/api/marketplaces/:slug/marketplace.json
```

Install a custom marketplace in Claude Code:

```bash
claude plugin marketplace add https://superchargeclaudecode.com/api/marketplaces/<slug>/marketplace.json
```

## Curated Marketplace

The main curated marketplace is **Supercharge Claude Code** at `/m/supercharge-claude-code`.

Categories: Marketing, Landing Pages, Web Applications, Scraping, Communication.

Install:

```bash
claude plugin marketplace add https://superchargeclaudecode.com/api/marketplaces/supercharge-claude-code/marketplace.json
```

## API Docs

Full documentation with curl examples available at [superchargeclaudecode.com/docs](https://superchargeclaudecode.com/docs) (API Reference tab).
