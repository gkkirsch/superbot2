# Troubleshooting Common Issues

## Deployment Errors

### "Script startup exceeded CPU time limit"

**Cause:** Top-level code (outside handlers) takes too long to execute.

**Fix:**
- Move heavy initialization inside the fetch handler or use lazy initialization
- Reduce bundle size (tree-shake, remove unused deps)
- Check for large static imports

```ts
// BAD — runs at startup
const bigData = JSON.parse(hugeJsonString);

// GOOD — lazy initialization
let bigData: Data | null = null;
function getData() {
  if (!bigData) bigData = JSON.parse(hugeJsonString);
  return bigData;
}
```

### "Worker exceeded size limit"

**Cause:** Bundled Worker exceeds 1MB (free) or 10MB (paid).

**Fix:**
```bash
# Check actual size
wrangler deploy --dry-run --outdir=dist
ls -la dist/

# Common fixes:
# 1. Remove large dependencies
# 2. Use lighter alternatives (hono instead of express)
# 3. Move static assets to R2/KV instead of bundling
# 4. Split into multiple Workers with Service Bindings
```

### "Could not resolve module"

**Cause:** Importing a Node.js module that isn't available in Workers.

**Fix:**
1. Add `nodejs_compat` flag: `compatibility_flags = ["nodejs_compat"]`
2. If still failing, find a Web API alternative or a Workers-compatible library
3. Check https://workers-nodejs-compat-matrix.pages.dev/ for compatibility

### "Error: No matching routes"

**Cause:** `wrangler.toml` route patterns don't match the request URL.

**Fix:**
- Check route patterns include trailing wildcard: `example.com/api/*`
- Verify zone_name matches your Cloudflare zone
- For custom domains, ensure DNS is proxied (orange cloud)

## Runtime Errors

### "Error: D1_ERROR: no such table"

**Cause:** Migrations haven't been applied.

**Fix:**
```bash
# Apply to remote
wrangler d1 migrations apply my-database --remote

# Verify
wrangler d1 execute my-database --remote --command ".tables"
```

### "Error: KV GET/PUT failed" or "KV namespace not found"

**Cause:** KV namespace ID in `wrangler.toml` doesn't match actual namespace.

**Fix:**
```bash
# List namespaces and verify IDs
wrangler kv namespace list

# Update wrangler.toml with correct ID
```

### CORS errors

**Cause:** Worker doesn't return CORS headers.

**Fix with Hono:**
```ts
import { cors } from "hono/cors";

app.use("*", cors({
  origin: ["https://mysite.com", "http://localhost:5173"],
  allowMethods: ["GET", "POST", "PUT", "DELETE"],
  allowHeaders: ["Content-Type", "Authorization"],
}));
```

**Fix without framework:**
```ts
function corsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders("https://mysite.com") });
    }

    const response = await handleRequest(request, env);
    // Add CORS headers to response
    const newHeaders = new Headers(response.headers);
    Object.entries(corsHeaders("https://mysite.com")).forEach(([k, v]) => {
      newHeaders.set(k, v as string);
    });
    return new Response(response.body, { ...response, headers: newHeaders });
  },
};
```

### "Exceeded CPU time limit" (runtime)

**Cause:** Request handler uses too much CPU (10ms free / 30s paid).

**Fix:**
- Optimize hot paths (avoid unnecessary JSON parsing, regex, etc.)
- Use `ctx.waitUntil()` for background work that doesn't need to block the response
- Move heavy computation to a Queue consumer (higher CPU limits)
- Upgrade to paid plan for 30s CPU time

```ts
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Return response fast
    const response = Response.json({ accepted: true });

    // Do heavy work in background
    ctx.waitUntil(doHeavyWork(env));

    return response;
  },
};
```

### "Subrequest limit exceeded"

**Cause:** Worker makes more than 50 subrequests (fetch calls) per invocation (free plan: 50, paid: 1000).

**Fix:**
- Batch API calls where possible
- Use Service Bindings instead of fetch for Worker-to-Worker calls
- Cache responses in KV to reduce outbound fetches

## Pages Deployment Issues

### Build fails

```bash
# Check build logs in dashboard or:
wrangler pages deployment list --project-name=my-site
```

Common fixes:
- **Wrong Node version**: Set `NODE_VERSION=18` in environment variables
- **Missing dependencies**: Ensure `package-lock.json` is committed
- **Wrong build command**: Verify framework's build command
- **Wrong output directory**: Check framework docs for build output path

### Pages Functions not working

- **Functions directory**: Must be `functions/` at project root (not inside `src/`)
- **File naming**: `functions/api/hello.ts` → route is `/api/hello`
- **TypeScript**: Pages Functions support TypeScript natively
- **Bindings not available**: Check `wrangler.toml` or dashboard settings

### Preview deployments not updating

- Preview deploys trigger on non-production branches
- Check branch configuration in Pages project settings
- Verify the push actually triggered a build (check dashboard)

## Local Development Issues

### wrangler dev won't start

```bash
# Check wrangler version
wrangler --version

# Update wrangler
npm install -g wrangler@latest

# Clear local state
rm -rf .wrangler/

# Try with verbose logging
wrangler dev --log-level debug
```

### Bindings work locally but not in production

- **D1**: Did you apply migrations remotely? `wrangler d1 migrations apply <db> --remote`
- **KV**: Is the namespace ID correct for production (not preview_id)?
- **R2**: Is the bucket name correct?
- **Secrets**: Did you set them with `wrangler secret put`?

### "TypeError: Cannot read properties of undefined (reading 'prepare')"

**Cause:** D1 binding not configured or binding name doesn't match code.

**Fix:** Verify the binding name in `wrangler.toml` matches what you use in code:
```toml
[[d1_databases]]
binding = "DB"  # ← this name
```
```ts
env.DB.prepare(...)  // ← must match
```

## Authentication Issues

### "Authentication error" with wrangler

```bash
# Re-authenticate
wrangler login

# Verify
wrangler whoami

# If using API token
export CLOUDFLARE_API_TOKEN=your-token
wrangler whoami
```

### CI/CD auth failing

- Verify `CLOUDFLARE_API_TOKEN` is set in CI environment
- Check token permissions (Workers Scripts: Edit, Account: Read)
- Token may have expired — regenerate at https://dash.cloudflare.com/profile/api-tokens

## Performance Issues

### Slow responses

1. Check `wrangler tail` for CPU time per request
2. Look for unnecessary awaits in series (parallelize with `Promise.all`)
3. Cache frequently accessed data in KV
4. Minimize subrequests to external services

```ts
// BAD — sequential
const user = await getUser(id);
const posts = await getPosts(id);
const comments = await getComments(id);

// GOOD — parallel
const [user, posts, comments] = await Promise.all([
  getUser(id),
  getPosts(id),
  getComments(id),
]);
```

### D1 slow queries

```bash
# Check query performance
wrangler d1 execute my-database --remote --command "EXPLAIN QUERY PLAN SELECT * FROM users WHERE email = 'test@example.com'"
```

Add indexes for frequently queried columns:
```sql
CREATE INDEX idx_users_email ON users(email);
```
