# Cloudflare Data Services

## Overview

Cloudflare provides three main data services, each for different use cases:

| Service | Type | Best for | Limits (free) |
|---------|------|----------|---------------|
| **D1** | SQLite database | Relational data, queries, joins | 5GB storage, 5M rows read/day |
| **KV** | Key-value store | Config, cache, session data | 1GB storage, 100K reads/day |
| **R2** | Object storage | Files, images, backups | 10GB storage, 10M reads/mo |

## D1 (SQLite Database)

### Create

```bash
wrangler d1 create my-database
```

This outputs the database ID. Add to `wrangler.toml`:
```toml
[[d1_databases]]
binding = "DB"
database_name = "my-database"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### Schema and Migrations

Create a `migrations/` directory:

```bash
mkdir migrations
```

Create a migration:
```bash
# Creates migrations/0001_create_users.sql
wrangler d1 migrations create my-database create_users
```

Write the SQL:
```sql
-- migrations/0001_create_users.sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_users_email ON users(email);
```

Apply migrations:
```bash
# Local (for development)
wrangler d1 migrations apply my-database --local

# Remote (production)
wrangler d1 migrations apply my-database --remote
```

### Querying D1

```ts
// Select all
const { results } = await env.DB.prepare("SELECT * FROM users").all();

// Select with parameters (ALWAYS use bind for user input)
const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?")
  .bind(userId)
  .first();

// Insert
await env.DB.prepare("INSERT INTO users (name, email) VALUES (?, ?)")
  .bind(name, email)
  .run();

// Update
await env.DB.prepare("UPDATE users SET name = ? WHERE id = ?")
  .bind(newName, userId)
  .run();

// Delete
await env.DB.prepare("DELETE FROM users WHERE id = ?")
  .bind(userId)
  .run();

// Batch (multiple statements in one round-trip)
const results = await env.DB.batch([
  env.DB.prepare("INSERT INTO users (name, email) VALUES (?, ?)").bind("Alice", "alice@example.com"),
  env.DB.prepare("INSERT INTO users (name, email) VALUES (?, ?)").bind("Bob", "bob@example.com"),
]);
```

### D1 CLI

```bash
# Execute SQL directly
wrangler d1 execute my-database --remote --command "SELECT * FROM users"

# Execute from file
wrangler d1 execute my-database --remote --file seed.sql

# Interactive shell
wrangler d1 execute my-database --remote

# Backup
wrangler d1 backup create my-database
wrangler d1 backup list my-database
wrangler d1 backup download my-database <backup-id>
```

### D1 Key Considerations

- **SQLite syntax** — not Postgres. No `SERIAL`, use `INTEGER PRIMARY KEY AUTOINCREMENT`. No `JSONB`, use `TEXT` with `json()` functions.
- **Reads are fast (edge-replicated), writes go to primary** — eventual consistency for reads after writes.
- **Max 1GB per database** (can create multiple databases).
- **Use `batch()` for multiple writes** — single round-trip, atomic.
- **Always use `.bind()` for parameters** — prevents SQL injection.

## KV (Key-Value Store)

### Create

```bash
wrangler kv namespace create MY_KV
```

Add to `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "MY_KV"
id = "xxxxxxxx"
preview_id = "yyyyyyyy"  # For wrangler dev
```

### Operations

```ts
// Write
await env.MY_KV.put("user:123", JSON.stringify({ name: "Alice", role: "admin" }));

// Write with TTL (seconds)
await env.MY_KV.put("session:abc", sessionData, { expirationTtl: 3600 });

// Write with expiration (Unix timestamp)
await env.MY_KV.put("token:xyz", tokenData, { expiration: 1700000000 });

// Write with metadata
await env.MY_KV.put("file:doc.pdf", fileData, {
  metadata: { contentType: "application/pdf", uploadedBy: "user:123" },
});

// Read
const value = await env.MY_KV.get("user:123");
const parsed = await env.MY_KV.get("user:123", { type: "json" });

// Read with metadata
const { value, metadata } = await env.MY_KV.getWithMetadata("file:doc.pdf");

// Delete
await env.MY_KV.delete("user:123");

// List keys
const { keys, cursor, list_complete } = await env.MY_KV.list({ prefix: "user:" });

// Paginate
let cursor: string | undefined;
do {
  const result = await env.MY_KV.list({ prefix: "user:", cursor });
  // process result.keys
  cursor = result.list_complete ? undefined : result.cursor;
} while (cursor);
```

### KV CLI

```bash
# Write
wrangler kv key put --namespace-id=abc123 "my-key" "my-value"

# Read
wrangler kv key get --namespace-id=abc123 "my-key"

# Delete
wrangler kv key delete --namespace-id=abc123 "my-key"

# List keys
wrangler kv key list --namespace-id=abc123

# Bulk put from JSON file
wrangler kv bulk put --namespace-id=abc123 data.json
```

### KV Key Considerations

- **Eventually consistent** — writes may take up to 60 seconds to propagate globally.
- **Optimized for reads** — high read throughput, lower write throughput.
- **Max value size**: 25MB. Max key size: 512 bytes.
- **Good for**: config, cache, session data, feature flags.
- **Bad for**: data that needs strong consistency or frequent writes.

## R2 (Object Storage)

S3-compatible object storage with zero egress fees.

### Create

```bash
wrangler r2 bucket create my-bucket
```

Add to `wrangler.toml`:
```toml
[[r2_buckets]]
binding = "BUCKET"
bucket_name = "my-bucket"
```

### Operations

```ts
// Upload
await env.BUCKET.put("images/photo.jpg", imageData, {
  httpMetadata: { contentType: "image/jpeg" },
  customMetadata: { uploadedBy: "user:123" },
});

// Download
const object = await env.BUCKET.get("images/photo.jpg");
if (object) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  return new Response(object.body, { headers });
}

// Head (metadata only)
const head = await env.BUCKET.head("images/photo.jpg");
console.log(head?.size, head?.httpMetadata?.contentType);

// Delete
await env.BUCKET.delete("images/photo.jpg");

// Delete multiple
await env.BUCKET.delete(["file1.jpg", "file2.jpg", "file3.jpg"]);

// List objects
const listed = await env.BUCKET.list({ prefix: "images/", limit: 100 });
for (const object of listed.objects) {
  console.log(object.key, object.size);
}

// Multipart upload (large files)
const upload = await env.BUCKET.createMultipartUpload("large-file.zip");
const part1 = await upload.uploadPart(1, chunk1);
const part2 = await upload.uploadPart(2, chunk2);
await upload.complete([part1, part2]);
```

### R2 with presigned URLs (direct browser upload)

```ts
// Generate presigned URL for client upload
import { AwsClient } from "aws4fetch";

const r2 = new AwsClient({
  accessKeyId: env.R2_ACCESS_KEY,
  secretAccessKey: env.R2_SECRET_KEY,
});

const url = new URL(`https://${env.ACCOUNT_ID}.r2.cloudflarestorage.com/${bucket}/${key}`);
const signed = await r2.sign(new Request(url, { method: "PUT" }), { aws: { signQuery: true } });
```

### R2 Public Access

Enable public access for a bucket:
```bash
# Via dashboard: R2 → bucket → Settings → Public access
# Or use custom domain (see domains-dns.md)
```

### R2 CLI

```bash
# Upload
wrangler r2 object put my-bucket/path/file.txt --file ./local-file.txt

# Download
wrangler r2 object get my-bucket/path/file.txt

# Delete
wrangler r2 object delete my-bucket/path/file.txt

# List
wrangler r2 bucket list
```

### R2 Key Considerations

- **S3-compatible API** — most S3 SDKs work with R2 (use `aws4fetch` in Workers).
- **Zero egress fees** — main selling point over S3.
- **Max object size**: 5TB. Max multipart part: 5GB.
- **Good for**: file uploads, images, static assets, backups.
- **No event notifications natively** — use a Worker to proxy uploads if you need triggers.

## Choosing the Right Service

```
Need SQL queries, joins, or relational data?
└── D1

Need fast key-value lookups with optional TTL?
└── KV

Need to store files, images, or large blobs?
└── R2

Need strong consistency for writes?
└── D1 (single-region writes) or Durable Objects (per-object consistency)

Need global read performance?
└── KV (eventually consistent, globally replicated) or D1 (read replicas)
```
