'use strict';
/* Google sign-in (ID token verification) and our own signed session tokens. No extra dependencies. */
const crypto = require('crypto');

const clientId = () => process.env.GOOGLE_CLIENT_ID || '';
const secret = () => 'vl-session|' + (process.env.SESSION_SECRET || process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.ADMIN_KEY || process.env.ADMIN_PASSWORD || '');
const b64u = b => Buffer.from(b).toString('base64url');

/* Google's public signing keys (cached; replaceable in tests). */
let keyCache = { at: 0, keys: [] };
let fetchKeys = async () => {
  const r = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!r.ok) throw new Error('certs');
  return (await r.json()).keys || [];
};
const setKeyFetcher = f => { fetchKeys = f; keyCache = { at: 0, keys: [] }; };
async function getKey(kid) {
  if (!keyCache.keys.some(k => k.kid === kid) || Date.now() - keyCache.at > 3600000) keyCache = { at: Date.now(), keys: await fetchKeys() };
  return keyCache.keys.find(k => k.kid === kid);
}

/* Returns { sub, email, name, picture } or null. */
async function verifyGoogle(idToken) {
  try {
    const cid = clientId();
    if (!cid || typeof idToken !== 'string' || idToken.length > 4000) return null;
    const [h, p, s] = idToken.split('.');
    if (!h || !p || !s) return null;
    const head = JSON.parse(Buffer.from(h, 'base64url').toString()), pay = JSON.parse(Buffer.from(p, 'base64url').toString());
    if (head.alg !== 'RS256') return null;
    const jwk = await getKey(head.kid);
    if (!jwk) return null;
    const ok = crypto.createVerify('RSA-SHA256').update(h + '.' + p).verify(crypto.createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(s, 'base64url'));
    if (!ok) return null;
    if (pay.aud !== cid || (pay.iss !== 'https://accounts.google.com' && pay.iss !== 'accounts.google.com')) return null;
    if (!pay.exp || pay.exp * 1000 < Date.now() || !pay.sub) return null;
    if (pay.email_verified === false) return null;
    return { sub: String(pay.sub), email: String(pay.email || ''), name: String(pay.name || ''), picture: String(pay.picture || '') };
  } catch (e) { return null; }
}

/* Our session: base64url(payload).hmac, valid 60 days. */
function makeSession(sub) {
  const body = b64u(JSON.stringify({ sub, exp: Date.now() + 60 * 86400000 }));
  return body + '.' + crypto.createHmac('sha256', secret()).update(body).digest('base64url');
}
function readSession(tok) {
  try {
    if (typeof tok !== 'string' || tok.length > 600) return null;
    const [body, sig] = tok.split('.');
    const good = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
    if (!sig || sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() && p.sub ? p.sub : null;
  } catch (e) { return null; }
}

module.exports = { clientId, verifyGoogle, makeSession, readSession, setKeyFetcher };
