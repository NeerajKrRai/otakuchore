/* ============================================================
   OtakuChore sync Worker — Cloudflare Workers + KV.
   Multi-tenant: one KV entry per family, guarded by a long token.
   Client does the merging; the server is a versioned key/value box
   with a pairing-code exchange. Photos are NOT synced (data only).

   KV keys:
     fam:<familyId>  -> { token, version, doc, updatedAt }
     pair:<CODE>     -> { familyId, token }   (expires in PAIR_TTL, single-use)

   Endpoints (all JSON):
     POST /family                 create → { familyId, token, version }
     GET  /family/:id             pull   → { version, doc }         (Bearer token)
     PUT  /family/:id             push   → { version } | 409 {version,doc}  (Bearer token)
     POST /pair                   { familyId } → { code, ttl }       (Bearer token)
     POST /pair/redeem            { code } → { familyId, token }      (single-use)
     GET  /health                 → { ok:true }
   ============================================================ */

const PAIR_TTL = 600;                 // pairing code lifetime (seconds)
const MAX_DOC_BYTES = 512 * 1024;     // family doc size cap (data-only, so small)
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I,L,O,0,1
const DEFAULT_ORIGINS = ['https://apps.neeksha.com'];

function allowedOrigins(env) {
  const extra = (env && env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',') : []).map(s => s.trim()).filter(Boolean);
  return DEFAULT_ORIGINS.concat(extra);
}
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const list = allowedOrigins(env);
  const ok = list.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin) || /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : list[0],
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}
function json(data, status, request, env) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders(request, env))
  });
}
function randToken() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); // base64url, ~43 chars
}
function randCode() {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  let s = ''; for (let i = 0; i < 8; i++) s += CODE_ALPHABET[b[i] % CODE_ALPHABET.length];
  return s; // 8 chars, ~40 bits
}
function uuid() { return crypto.randomUUID(); }
// constant-time-ish string compare
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function bearer(request) {
  const h = request.headers.get('Authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    if (path === '/health') return json({ ok: true }, 200, request, env);

    if (!env || !env.KV) return json({ error: 'server-misconfigured (no KV binding)' }, 500, request, env);

    try {
      // ---- create a family ----
      if (path === '/family' && request.method === 'POST') {
        const body = await readJson(request);
        if (!body || typeof body.doc !== 'object') return json({ error: 'doc required' }, 400, request, env);
        if (tooBig(body.doc)) return json({ error: 'doc too large' }, 413, request, env);
        const familyId = uuid(), token = randToken();
        await env.KV.put('fam:' + familyId, JSON.stringify({ token, version: 1, doc: body.doc, updatedAt: new Date().toISOString() }));
        return json({ familyId, token, version: 1 }, 200, request, env);
      }

      // ---- pull / push a family ----
      const famMatch = path.match(/^\/family\/([A-Za-z0-9-]+)$/);
      if (famMatch) {
        const familyId = famMatch[1];
        const raw = await env.KV.get('fam:' + familyId);
        if (!raw) return json({ error: 'not found' }, 404, request, env);
        const rec = JSON.parse(raw);
        if (!safeEqual(bearer(request) || '', rec.token)) return json({ error: 'unauthorized' }, 401, request, env);

        if (request.method === 'GET') return json({ version: rec.version, doc: rec.doc }, 200, request, env);

        if (request.method === 'PUT') {
          const body = await readJson(request);
          if (!body || typeof body.doc !== 'object') return json({ error: 'doc required' }, 400, request, env);
          if (tooBig(body.doc)) return json({ error: 'doc too large' }, 413, request, env);
          // optimistic concurrency: client must be up to date
          if (typeof body.baseVersion === 'number' && body.baseVersion !== rec.version) {
            return json({ error: 'conflict', version: rec.version, doc: rec.doc }, 409, request, env);
          }
          const next = { token: rec.token, version: rec.version + 1, doc: body.doc, updatedAt: new Date().toISOString() };
          await env.KV.put('fam:' + familyId, JSON.stringify(next));
          return json({ version: next.version }, 200, request, env);
        }
        return json({ error: 'method not allowed' }, 405, request, env);
      }

      // ---- issue a pairing code (owner only) ----
      if (path === '/pair' && request.method === 'POST') {
        const body = await readJson(request);
        const familyId = body && body.familyId;
        if (!familyId) return json({ error: 'familyId required' }, 400, request, env);
        const raw = await env.KV.get('fam:' + familyId);
        if (!raw) return json({ error: 'not found' }, 404, request, env);
        const rec = JSON.parse(raw);
        if (!safeEqual(bearer(request) || '', rec.token)) return json({ error: 'unauthorized' }, 401, request, env);
        const code = randCode();
        await env.KV.put('pair:' + code, JSON.stringify({ familyId, token: rec.token }), { expirationTtl: PAIR_TTL });
        return json({ code, ttl: PAIR_TTL }, 200, request, env);
      }

      // ---- redeem a pairing code (single-use) ----
      if (path === '/pair/redeem' && request.method === 'POST') {
        const body = await readJson(request);
        const code = (body && body.code ? String(body.code) : '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!code) return json({ error: 'code required' }, 400, request, env);
        const raw = await env.KV.get('pair:' + code);
        if (!raw) return json({ error: 'invalid or expired code' }, 410, request, env);
        await env.KV.delete('pair:' + code); // single use
        const v = JSON.parse(raw);
        return json({ familyId: v.familyId, token: v.token }, 200, request, env);
      }

      return json({ error: 'not found' }, 404, request, env);
    } catch (e) {
      return json({ error: 'server error', detail: String(e && e.message || e) }, 500, request, env);
    }
  }
};

function tooBig(obj) {
  try { return new TextEncoder().encode(JSON.stringify(obj)).length > MAX_DOC_BYTES; }
  catch (e) { return true; }
}
async function readJson(request) {
  try { return await request.json(); } catch (e) { return null; }
}
