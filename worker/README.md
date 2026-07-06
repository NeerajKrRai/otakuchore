# OtakuChore sync Worker

Optional Cloudflare Worker that powers **cross-device sync** (v2). The app works
fully without it (single-device); deploying this just lets a family share one
live dataset across devices via a pairing code. **Photos/videos are never synced**
— only the family data (profiles, chores, points, approvals, rewards, chat).

Multi-tenant: one KV entry per family, guarded by a long random token. The client
does all merging; the Worker is a versioned key/value box + a single-use pairing
code exchange.

## Deploy (needs your Cloudflare account)

```bash
cd worker
npm i -g wrangler          # or use npx wrangler ...
wrangler login             # opens browser to authorize your Cloudflare account

# 1) create the KV namespace, copy the printed id into wrangler.toml (id = "...")
wrangler kv namespace create SYNC

# 2) deploy
wrangler deploy
```

`wrangler deploy` prints the Worker URL, e.g. `https://otakuchore-sync.<you>.workers.dev`.
Put that URL into the app: `js/config.js` → `SYNC_URL`.

### Custom domain (optional, nicer)
Add a route on your `neeksha.com` zone (e.g. `api.neeksha.com/*`) in the Cloudflare
dashboard → Workers Routes, or a `[[routes]]` block in `wrangler.toml`, then use that
URL as `SYNC_URL`.

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/family` | — | create a family, returns `{familyId, token, version}` |
| GET | `/family/:id` | Bearer token | pull `{version, doc}` |
| PUT | `/family/:id` | Bearer token | push `{doc, baseVersion}` → `{version}` (409 on stale) |
| POST | `/pair` | Bearer token | issue `{code, ttl}` (10-min, single-use) |
| POST | `/pair/redeem` | — | `{code}` → `{familyId, token}` |
| GET | `/health` | — | `{ok:true}` |

Security: family token is 32 random bytes (base64url). Pairing codes are 8 chars
(~40 bits), single-use, expire in 10 minutes. CORS is locked to
`https://apps.neeksha.com` (+ localhost for dev). Family doc capped at 512 KB.
