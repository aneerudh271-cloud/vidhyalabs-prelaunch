'use strict';
/* POST /api  { type: 'order' | 'message' | 'signup' | 'track' | 'store_apply' | 'driver' | 'store' | 'admin', ... }
   GET  /api  health check; add ?db=1 to also test the database connection. */
const db = require('../lib/db');
const { handle, adminKey } = require('../lib/vl');

function send(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.end(JSON.stringify(body));
}
function readBody(req) {
  if (req.body !== undefined && req.body !== null && typeof req.body !== 'string' && !Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if (typeof req.body === 'string') return Promise.resolve(req.body);
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body.toString('utf8'));
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', c => { s += c; if (s.length > 40000) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => resolve(s));
    req.on('error', reject);
  });
}

module.exports = async function (req, res) {
  try {
    if (req.method === 'GET' || req.method === 'HEAD') {
      const out = { ok: true, service: 'vidhyalabs', database: db.configured() ? 'configured' : 'missing', admin: adminKey() ? 'configured' : 'missing' };
      if ((req.url || '').indexOf('db=1') > -1 && db.configured()) {
        try { await db.run('SELECT 1'); out.database = 'connected'; } catch (e) { out.database = 'error'; }
      }
      return send(res, 200, out);
    }
    if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'method not allowed' });
    let raw = await readBody(req), d = raw;
    if (typeof raw === 'string') { if (raw.length > 40000) return send(res, 413, { ok: false, error: 'too large' }); try { d = JSON.parse(raw); } catch (e) { return send(res, 400, { ok: false, error: 'bad request' }); } }
    const ip = String((req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || 'x')).split(',')[0].trim().slice(0, 64);
    return send(res, 200, await handle(d, ip));
  } catch (e) {
    if (e && e.code === 'NODB') return send(res, 200, { ok: false, error: 'database not connected' });
    console.error('api error', e && e.message);
    return send(res, 200, { ok: false, error: 'server error' });
  }
};
