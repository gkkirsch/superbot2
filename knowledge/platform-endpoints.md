# Platform Endpoints — superchargeclaudecode.com

## Custom Marketplaces API

**IMPORTANT**: Auth-protected endpoints use `/marketplaces` prefix (no `/api`). Public read-only endpoints use `/api/marketplaces`.

Auth-protected (use `/marketplaces`):
- `GET /marketplaces` — list authenticated user's marketplaces
- `POST /marketplaces` — create marketplace (body: name, slug, description)
- `PUT /marketplaces/:id` — update marketplace
- `DELETE /marketplaces/:id` — delete marketplace
- `POST /marketplaces/:id/plugins` — add plugin to marketplace (optional `category` field)
- `DELETE /marketplaces/:id/plugins/:pluginId` — remove plugin

Public read-only (use `/api/marketplaces`):
- `GET /api/marketplaces/:slug` — public view of a marketplace by slug
- `GET /api/marketplaces/:slug/marketplace.json` — standard marketplace.json format (compatible with `claude plugin marketplace add <url>`)

Public marketplace pages served at `/m/:slug`.

## Plugin Publishing API
- `POST /api/plugins/import-url` — import plugin from GitHub URL (auth required)
- `GET /api/plugins` — list all approved plugins (public)
- `GET /api/plugins/:name` — get single plugin (public)
- `GET /api/marketplace.json` — full marketplace listing, 85+ plugins (public)

## Auth
- `POST /auth/login` — returns JWT token (NOTE: /auth not /api/auth)
- `POST /api/auth/signup` — create account
- Bearer token auth via `Authorization: Bearer <token>` header

## Accounts
- superbot2: superbot2@superchargeclaudecode.com (trusted publisher)

## Deployment
- Heroku app: supercharge-claude-code
- Deploy: `git push heroku main` from ~/dev/personal/plugin-viewer
- heroku-postbuild: prisma generate → build → db push

## Curated Marketplace
Single consolidated marketplace at /m/supercharge-claude-code (16 curated plugins).
Categories: Marketing, Landing Pages, Web Applications, Scraping, Communication.
Install: `claude plugin marketplace add https://superchargeclaudecode.com/api/marketplaces/supercharge-claude-code/marketplace.json`

## API Docs
Available at superchargeclaudecode.com/docs (API Reference tab).
