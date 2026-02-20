# Cloudflare Pages Deployment

## Overview

Cloudflare Pages hosts static sites and full-stack applications. It builds from Git (GitHub/GitLab) or via direct upload with Wrangler.

## Deployment Methods

### Method 1: Git Integration (Recommended for teams)

1. Go to https://dash.cloudflare.com → Workers & Pages → Create
2. Connect GitHub/GitLab repo
3. Configure build settings:
   - **Build command**: `npm run build`
   - **Build output directory**: `dist` (Vite), `build` (CRA), `.next` (Next.js), `out` (Astro static)
4. Deploy

Every push to the production branch triggers a deploy. PRs get preview deployments automatically.

### Method 2: Direct Upload with Wrangler (Recommended for CI/CD)

```bash
# First deploy — creates the project
wrangler pages deploy dist/ --project-name=my-app

# Subsequent deploys
npm run build && wrangler pages deploy dist/ --project-name=my-app
```

### Method 3: wrangler pages project + wrangler.toml

For repeatable config, define the project in `wrangler.toml`:

```toml
name = "my-app"
pages_build_output_dir = "./dist"
```

Then deploy with:
```bash
npm run build && wrangler pages deploy
```

## Framework Support

### React + Vite

```bash
npm create vite@latest my-app -- --template react-ts
cd my-app && npm install && npm run build
wrangler pages deploy dist/ --project-name=my-app
```

Build settings (Git integration):
- **Build command**: `npm run build`
- **Output directory**: `dist`

### Next.js

Next.js on Pages uses `@cloudflare/next-on-pages`.

```bash
npm install --save-dev @cloudflare/next-on-pages
```

Add to `next.config.js`:
```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for Cloudflare Pages
};

module.exports = nextConfig;
```

Build settings:
- **Build command**: `npx @cloudflare/next-on-pages`
- **Output directory**: `.vercel/output/static`

**Important:** Not all Next.js features work. Middleware, ISR, and some dynamic features have limitations. Check the `@cloudflare/next-on-pages` docs for compatibility.

### Astro

Astro works out of the box for static sites. For SSR, use the Cloudflare adapter:

```bash
npx astro add cloudflare
```

This installs `@astrojs/cloudflare` and updates `astro.config.mjs`:

```js
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  output: "server", // or "hybrid" for mixed static/SSR
  adapter: cloudflare(),
});
```

Build settings:
- **Build command**: `npm run build`
- **Output directory**: `dist` (static) or `dist/_worker.js` is created automatically (SSR)

### SvelteKit

```bash
npm install --save-dev @sveltejs/adapter-cloudflare
```

In `svelte.config.js`:
```js
import adapter from "@sveltejs/adapter-cloudflare";

export default {
  kit: {
    adapter: adapter(),
  },
};
```

## Pages Functions

Pages Functions let you add server-side logic alongside your static site. They're Workers that run when requests match specific routes.

### File-based routing

Create a `functions/` directory in your project root:

```
my-app/
├── functions/
│   ├── api/
│   │   ├── hello.ts          → GET/POST /api/hello
│   │   ├── users/
│   │   │   ├── index.ts      → GET/POST /api/users
│   │   │   └── [id].ts       → GET/POST /api/users/:id
│   │   └── [[catchall]].ts   → /api/* (catch-all)
│   └── _middleware.ts         → Runs on ALL routes
├── src/
├── dist/
└── package.json
```

### Function handler

```ts
// functions/api/hello.ts
export const onRequestGet: PagesFunction = async (context) => {
  return Response.json({ message: "Hello from the edge!" });
};

export const onRequestPost: PagesFunction = async (context) => {
  const body = await context.request.json();
  return Response.json({ received: body });
};
```

### Middleware

```ts
// functions/_middleware.ts
export const onRequest: PagesFunction = async (context) => {
  // Runs before every request
  const response = await context.next();
  response.headers.set("X-Custom-Header", "value");
  return response;
};
```

### Binding data services to Functions

In `wrangler.toml`:
```toml
name = "my-app"
pages_build_output_dir = "./dist"

[[d1_databases]]
binding = "DB"
database_name = "my-db"
database_id = "abc123"

[vars]
API_URL = "https://api.example.com"
```

Access in functions via `context.env`:
```ts
export const onRequestGet: PagesFunction<{ DB: D1Database; API_URL: string }> = async (context) => {
  const result = await context.env.DB.prepare("SELECT * FROM users").all();
  return Response.json(result);
};
```

## Preview Deployments

Every non-production branch gets a unique preview URL:
- Pattern: `<commit-hash>.<project-name>.pages.dev`
- Branch aliases: `<branch-name>.<project-name>.pages.dev`

Useful for PR reviews and staging environments.

## Production vs Preview Environments

Pages supports different env vars per environment:

```bash
# Production
wrangler pages secret put API_KEY --env production

# Preview
wrangler pages secret put API_KEY --env preview
```

Or in the dashboard: Project → Settings → Environment variables.

## Build Configuration

### Environment variables in builds

Set via dashboard or `wrangler.toml`:
- `NODE_VERSION` — Pin Node.js version (e.g., `18`)
- `NPM_FLAGS` — Extra flags for npm install
- Framework-specific vars (e.g., `VITE_API_URL` for Vite)

### Build caching

Pages caches `node_modules` between builds by default. To bust cache, trigger a new deploy or go to Settings → Builds → Clear cache.

### Monorepo support

Set the **root directory** in build settings to your app's subdirectory:
- Root directory: `packages/web`
- Build command: `npm run build`
- Output directory: `dist`
