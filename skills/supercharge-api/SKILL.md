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

### Login

```bash
curl -X POST https://superchargeclaudecode.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "superbot2@superchargeclaudecode.com", "password": "<password>"}'
```

Response includes a JWT token. Use it for all authenticated requests:

```
Authorization: Bearer <token>
```

### Signup

```bash
curl -X POST https://superchargeclaudecode.com/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "...", "name": "..."}'
```

## Account

- **superbot2**: superbot2@superchargeclaudecode.com (trusted publisher, `isTrustedPublisher: true`)

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
curl https://superchargeclaudecode.com/api/marketplace.json
```

### Import Plugin from GitHub (auth required)

```bash
curl -X POST https://superchargeclaudecode.com/plugins/import-url \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://github.com/user/repo"}'
```

Also supports subdirectory URLs (e.g., `https://github.com/owner/repo/tree/main/skills/my-skill`).

For trusted publishers, imported plugins are auto-approved.

### Plugin Upload — Folder/File Upload (auth required)

Upload a local plugin folder via the multi-step API. There is no single zip endpoint — upload files individually with their relative paths.

**Step 1: Create a plugin draft**

```bash
curl -X POST https://superchargeclaudecode.com/plugins \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-plugin",
    "description": "What this plugin does",
    "version": "1.0.0",
    "tags": ["tag1", "tag2"]
  }'
```

Response includes `data.id` (the pluginId for subsequent calls) and `data.slug`.

Required fields: `name` (2-50 chars, alphanumeric/hyphens/underscores), `description`, `version` (semver).
Optional fields: `shortDesc`, `authorName`, `tags` (max 10), `repositoryUrl`.

**Step 2: Upload files one at a time**

```bash
curl -X POST https://superchargeclaudecode.com/plugins/<pluginId>/files \
  -H "Authorization: Bearer <token>" \
  -F "file=@./skills/my-skill/SKILL.md" \
  -F "relativePath=skills/my-skill/SKILL.md"
```

- `file`: The file content (multipart/form-data, max 5MB per file)
- `relativePath`: Path within the plugin directory structure (preserves folder hierarchy)

The server auto-detects file type (SKILL, COMMAND, AGENT, HOOK, MCP_CONFIG, OTHER) from the path.

System files (.DS_Store, Thumbs.db, desktop.ini, ._* files) are silently skipped.

**Step 3: Submit for review**

```bash
curl -X POST https://superchargeclaudecode.com/plugins/<pluginId>/submit \
  -H "Authorization: Bearer <token>"
```

For trusted publishers (e.g., superbot2), plugins are auto-approved on submit.

**Full example — upload a plugin folder via bash:**

```bash
# Login
TOKEN=$(curl -s -X POST https://superchargeclaudecode.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"$SUPERCHARGE_EMAIL","password":"$SUPERCHARGE_PASSWORD"}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['token'])")

# Create plugin
PLUGIN_ID=$(curl -s -X POST https://superchargeclaudecode.com/plugins \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-plugin","description":"My plugin","version":"1.0.0"}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['id'])")

# Upload each file (preserving relative paths)
for file in skills/my-skill/SKILL.md .claude-plugin/plugin.json README.md; do
  curl -s -X POST "https://superchargeclaudecode.com/plugins/${PLUGIN_ID}/files" \
    -H "Authorization: Bearer $TOKEN" \
    -F "file=@./${file}" \
    -F "relativePath=${file}"
done

# Submit for review
curl -s -X POST "https://superchargeclaudecode.com/plugins/${PLUGIN_ID}/submit" \
  -H "Authorization: Bearer $TOKEN"
```

### Delete File from Plugin (auth required)

```bash
curl -X DELETE https://superchargeclaudecode.com/plugins/<pluginId>/files/<fileId> \
  -H "Authorization: Bearer <token>"
```

### Delete Plugin (auth required)

```bash
curl -X DELETE https://superchargeclaudecode.com/plugins/<pluginId> \
  -H "Authorization: Bearer <token>"
```

### Get User's Plugins (auth required)

```bash
curl https://superchargeclaudecode.com/plugins/my-plugins \
  -H "Authorization: Bearer <token>"
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

## Deployment

- **Heroku app**: supercharge-claude-code
- **Source**: ~/dev/personal/plugin-viewer
- **Deploy**: `git push heroku main` from the source directory
- **Post-build**: prisma generate, build, db push

## API Docs

Full documentation with curl examples available at [superchargeclaudecode.com/docs](https://superchargeclaudecode.com/docs) (API Reference tab).
