'use strict';
/* VidhyaLabs API logic. Same JSON protocol the website, app, admin, driver and store pages already use. */
const crypto = require('crypto');
const db = require('./db');

const STATUSES = ['Placed', 'Confirmed', 'Ready for pickup', 'Out for delivery', 'Delivered', 'Cancelled'];
const LIMIT = 400;
const DAY2 = 2 * 86400000;

const ph = p => String(p || '').replace(/\D/g, '').slice(-10);
const str = (x, n) => String(x == null ? '' : x).slice(0, n || 500);
const num = x => Number(x) || 0;
const newId = prefix => prefix + Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString('hex').toUpperCase();
const newPin = () => String(crypto.randomInt(100000, 1000000));
const hash = (phone, pin) => crypto.createHash('sha256').update('vl|' + ph(phone) + '|' + String(pin)).digest('hex');
const sameKey = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};
const adminKey = () => process.env.ADMIN_KEY || process.env.ADMIN_PASSWORD || '';
const isAdmin = key => { const k = adminKey(); return !!k && typeof key === 'string' && sameKey(key, k); };
const q = (text, params) => db.run(text, params);
const parseItems = v => (Array.isArray(v) ? v : (() => { try { return JSON.parse(v) || []; } catch (e) { return []; } })());

/* ---------- lockouts and rate limits (stored in Postgres so they work across serverless instances) ---------- */
async function isLocked(k, max) {
  const r = await q('SELECT n, until FROM rl WHERE k = $1', [k]);
  return !!(r[0] && Number(r[0].until) > Date.now() && Number(r[0].n) >= max);
}
async function hit(k, windowMs) {
  const now = Date.now();
  await q(`INSERT INTO rl (k, n, until) VALUES ($1, 1, $2)
           ON CONFLICT (k) DO UPDATE SET n = CASE WHEN rl.until < $3 THEN 1 ELSE rl.n + 1 END,
             until = CASE WHEN rl.until < $3 THEN $2 ELSE rl.until END`, [k, now + windowMs, now]);
  const r = await q('SELECT n FROM rl WHERE k = $1', [k]);
  return Number(r[0] && r[0].n) || 1;
}
const clear = k => q('DELETE FROM rl WHERE k = $1', [k]);

/* ---------- customers ---------- */
async function addOrder(d) {
  const c = d.customer || {}, phone = ph(c.phone), id = str(d.id, 30);
  if (!id || phone.length !== 10 || !Array.isArray(d.lines) || !d.lines.length) return { ok: false, error: 'invalid order' };
  const items = d.lines.slice(0, 60).map(l => ({ text: str(l && l.text, 200) }));
  const now = Date.now();
  const r = await q(`INSERT INTO orders (id, at, status, name, phone, area, address, payment, slot, when_text, notes, total, unpriced, items, updated)
    VALUES ($1,$2,'Placed',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$2) ON CONFLICT (id) DO NOTHING RETURNING id`,
    [id, now, str(c.name, 80), phone, str(c.area, 60), str(c.address, 300), str(d.payment, 40), str(d.slot, 60), str(d.when, 80), str(d.notes, 300),
      num(d.total), Math.trunc(num(d.unpriced)), JSON.stringify(items)]);
  return r.length ? { ok: true } : { ok: true, duplicate: true };
}

async function addMessage(d) {
  const c = d.customer || {}, phone = ph(c.phone), text = str(d.text, 1000).trim();
  if (phone.length !== 10 || !text) return { ok: false, error: 'invalid message' };
  await q('INSERT INTO messages (at, phone, name, sender, text) VALUES ($1,$2,$3,$4,$5)', [Date.now(), phone, str(c.name, 80), 'customer', text]);
  return { ok: true };
}

async function addSignup(d) {
  const phone = ph(d.phone);
  if (phone.length !== 10) return { ok: false, error: 'invalid signup' };
  const interests = Array.isArray(d.interests) ? d.interests.slice(0, 12).map(x => str(x, 40)).join(', ') : '';
  await q('INSERT INTO waitlist (at, name, phone, area, interests) VALUES ($1,$2,$3,$4,$5)', [Date.now(), str(d.name, 80), phone, str(d.area, 80), interests]);
  return { ok: true };
}

/** Customer app asks for the status of its own orders and replies from the team. */
async function track(d) {
  const phone = ph(d.phone), ids = (Array.isArray(d.ids) ? d.ids : []).slice(0, 40).map(x => str(x, 30));
  if (phone.length !== 10) return { ok: false, error: 'invalid phone' };
  const orders = {};
  if (ids.length) (await q('SELECT id, status FROM orders WHERE phone = $1 AND id = ANY($2::text[])', [phone, ids])).forEach(r => { orders[r.id] = r.status; });
  const rep = await q(`SELECT at, text FROM (SELECT at, text FROM messages WHERE phone = $1 AND sender = 'team' ORDER BY at DESC LIMIT 50) t ORDER BY at ASC`, [phone]);
  return { ok: true, orders, replies: rep.map(r => ({ at: Number(r.at), text: r.text })) };
}

/* ---------- partner stores ---------- */
async function storeApply(d) {
  const name = str(d.name, 100).trim(), owner = str(d.owner, 80).trim(), phone = ph(d.phone), area = str(d.area, 80).trim(), address = str(d.address, 300).trim();
  if (name.length < 2 || owner.length < 2 || phone.length !== 10 || !area || !address) return { ok: false, error: 'invalid' };
  const cats = (Array.isArray(d.categories) ? d.categories : []).slice(0, 12).map(x => str(x, 40)).join(', ');
  const now = Date.now();
  try {
    await q(`INSERT INTO stores (id, at, status, name, owner, phone, area, address, categories, fssai, notes, pinhash, updated)
             VALUES ($1,$2,'Pending',$3,$4,$5,$6,$7,$8,$9,$10,'',$2)`, [newId('S'), now, name, owner, phone, area, address, cats, str(d.fssai, 40), str(d.notes, 400)]);
  } catch (e) {
    if (e && String(e.code) === '23505') return { ok: false, error: 'already applied' };
    throw e;
  }
  return { ok: true };
}

/* Five wrong PINs lock that phone number for 15 minutes. */
async function authRole(d, table, role) {
  const phone = ph(d.phone), pin = String(d.pin == null ? '' : d.pin);
  if (phone.length !== 10 || !pin) return null;
  const who = role + phone;
  if (await isLocked(who, 5)) return { locked: true };
  const cond = table === 'stores' ? "status = 'Approved' AND pinhash <> ''" : 'active = true';
  const r = await q(`SELECT * FROM ${table} WHERE phone = $1 AND ${cond}`, [phone]);
  const row = r[0];
  if (!row || !sameKey(row.pinhash, hash(phone, pin))) { await hit(who, 15 * 60000); return null; }
  await clear(who);
  return row;
}

async function storeApi(d) {
  const st = await authRole(d, 'stores', 's');
  if (st && st.locked) return { ok: false, error: 'locked' };
  if (!st) return { ok: false, error: 'auth' };
  if (d.action === 'list') {
    const r = await q(`SELECT * FROM (SELECT * FROM orders WHERE store = $1 AND status <> 'Cancelled' AND (status <> 'Delivered' OR updated > $2)
      ORDER BY at DESC LIMIT ${LIMIT}) t ORDER BY at DESC`, [st.id, Date.now() - DAY2]);
    // stores see what to pack, not who the customer is
    return { ok: true, store: { name: st.name }, orders: r.map(o => ({ id: o.id, at: Number(o.at), status: o.status, area: o.area, slot: o.slot, lines: parseItems(o.items) })) };
  }
  if (d.action === 'ready') {
    const r = await q(`UPDATE orders SET status = 'Ready for pickup', updated = $3 WHERE id = $1 AND store = $2 AND status IN ('Placed','Confirmed') RETURNING id`, [str(d.id, 30), st.id, Date.now()]);
    if (r.length) return { ok: true };
    const e = await q('SELECT 1 FROM orders WHERE id = $1 AND store = $2', [str(d.id, 30), st.id]);
    return { ok: false, error: e.length ? 'not allowed' : 'not found' };
  }
  return { ok: false, error: 'unknown action' };
}

/* ---------- delivery drivers ---------- */
async function driverApi(d) {
  const dr = await authRole(d, 'drivers', 'd');
  if (dr && dr.locked) return { ok: false, error: 'locked' };
  if (!dr) return { ok: false, error: 'auth' };
  if (d.action === 'list') {
    const r = await q(`SELECT * FROM (SELECT * FROM orders WHERE driver = $1 AND status <> 'Cancelled' AND (status <> 'Delivered' OR updated > $2)
      ORDER BY at DESC LIMIT ${LIMIT}) t ORDER BY at DESC`, [dr.id, Date.now() - DAY2]);
    return { ok: true, driver: { name: dr.name }, orders: r.map(o => ({
      id: o.id, at: Number(o.at), status: o.status, payment: o.payment, slot: o.slot, when: o.when_text, notes: o.notes, total: num(o.total), unpriced: num(o.unpriced), lines: parseItems(o.items),
      customer: { name: o.name, phone: ph(o.phone), area: o.area, address: o.address } })) };
  }
  if (d.action === 'status') {
    if (d.status !== 'Out for delivery' && d.status !== 'Delivered') return { ok: false, error: 'bad status' };
    const r = await q(`UPDATE orders SET status = $3, updated = $4 WHERE id = $1 AND driver = $2 AND status <> 'Cancelled' RETURNING id`, [str(d.id, 30), dr.id, d.status, Date.now()]);
    if (r.length) return { ok: true };
    const e = await q('SELECT status FROM orders WHERE id = $1 AND driver = $2', [str(d.id, 30), dr.id]);
    return { ok: false, error: e.length ? 'cancelled' : 'not found' };
  }
  return { ok: false, error: 'unknown action' };
}

/* ---------- admin ---------- */
async function admin(d, ip) {
  const lockKey = 'a' + ip;
  if (await isLocked(lockKey, 10)) return { ok: false, error: 'locked' };
  if (!isAdmin(d.key)) { await hit(lockKey, 15 * 60000); return { ok: false, error: 'auth' }; }
  await clear(lockKey);

  if (d.action === 'list') {
    const [o, m, w, dr, s] = await Promise.all([
      q(`SELECT * FROM (SELECT * FROM orders ORDER BY at DESC LIMIT ${LIMIT}) t ORDER BY at DESC`),
      q(`SELECT * FROM (SELECT * FROM messages ORDER BY at DESC, id DESC LIMIT ${LIMIT}) t ORDER BY at ASC, id ASC`),
      q(`SELECT * FROM waitlist ORDER BY at DESC LIMIT ${LIMIT}`),
      q('SELECT * FROM drivers ORDER BY created ASC'),
      q('SELECT * FROM stores ORDER BY at DESC')]);
    return { ok: true, statuses: STATUSES,
      orders: o.map(r => ({ id: r.id, at: Number(r.at), status: r.status, payment: r.payment, slot: r.slot, when: r.when_text, notes: r.notes, total: num(r.total), unpriced: num(r.unpriced),
        lines: parseItems(r.items), driver: r.driver || '', store: r.store || '', customer: { name: r.name, phone: ph(r.phone), area: r.area, address: r.address } })),
      messages: m.map(r => ({ at: Number(r.at), phone: ph(r.phone), name: r.name, from: r.sender, text: r.text })),
      waitlist: w.map(r => ({ at: Number(r.at), name: r.name, phone: ph(r.phone), area: r.area, interests: String(r.interests || '').split(', ').filter(Boolean) })),
      drivers: dr.map(r => ({ id: r.id, name: r.name, phone: ph(r.phone), active: !!r.active })),
      stores: s.map(r => ({ id: r.id, at: Number(r.at), status: r.status, name: r.name, owner: r.owner, phone: ph(r.phone), area: r.area, address: r.address,
        categories: String(r.categories || '').split(', ').filter(Boolean), fssai: r.fssai, notes: r.notes })) };
  }
  if (d.action === 'status') {
    if (STATUSES.indexOf(d.status) < 0) return { ok: false, error: 'bad status' };
    const r = await q('UPDATE orders SET status = $2, updated = $3 WHERE id = $1 RETURNING id', [str(d.id, 30), d.status, Date.now()]);
    return r.length ? { ok: true } : { ok: false, error: 'not found' };
  }
  if (d.action === 'assign') {
    const id = str(d.id, 30), drv = str(d.driver, 30), sto = str(d.store, 30);
    if (!(await q('SELECT 1 FROM orders WHERE id = $1', [id])).length) return { ok: false, error: 'not found' };
    if (drv && !(await q('SELECT 1 FROM drivers WHERE id = $1 AND active = true', [drv])).length) return { ok: false, error: 'unknown driver' };
    if (sto && !(await q(`SELECT 1 FROM stores WHERE id = $1 AND status = 'Approved'`, [sto])).length) return { ok: false, error: 'unknown store' };
    await q('UPDATE orders SET driver = $2, store = $3, updated = $4 WHERE id = $1', [id, drv, sto, Date.now()]);
    return { ok: true };
  }
  if (d.action === 'reply') {
    const phone = ph(d.phone), text = str(d.text, 1000).trim();
    if (phone.length !== 10 || !text) return { ok: false, error: 'invalid reply' };
    await q('INSERT INTO messages (at, phone, name, sender, text) VALUES ($1,$2,$3,$4,$5)', [Date.now(), phone, str(d.name, 80), 'team', text]);
    return { ok: true };
  }
  if (d.action === 'driverSave') {
    const name = str(d.name, 80).trim(), phone = ph(d.phone), active = d.active !== false;
    if (name.length < 2 || phone.length !== 10) return { ok: false, error: 'invalid driver' };
    const me = d.id ? (await q('SELECT * FROM drivers WHERE id = $1', [str(d.id, 30)]))[0] : null;
    const clash = await q('SELECT id FROM drivers WHERE phone = $1', [phone]);
    if (clash.some(r => !me || r.id !== me.id)) return { ok: false, error: 'phone already used' };
    if (!me) {
      const pin = newPin(), id = newId('D');
      await q('INSERT INTO drivers (id, name, phone, pinhash, active, created) VALUES ($1,$2,$3,$4,$5,$6)', [id, name, phone, hash(phone, pin), active, Date.now()]);
      return { ok: true, id, pin };
    }
    let pin = null;
    if (d.resetPin || ph(me.phone) !== phone) pin = newPin();
    await q('UPDATE drivers SET name = $2, phone = $3, active = $4, pinhash = COALESCE($5, pinhash) WHERE id = $1', [me.id, name, phone, active, pin ? hash(phone, pin) : null]);
    if (pin) await clear('d' + phone);
    return { ok: true, id: me.id, pin };
  }
  if (d.action === 'storeDecide') {
    const id = str(d.id, 30), st = (await q('SELECT * FROM stores WHERE id = $1', [id]))[0];
    if (!st) return { ok: false, error: 'not found' };
    if (d.decision === 'approve' || d.decision === 'resetpin') {
      if (d.decision === 'resetpin' && st.status !== 'Approved') return { ok: false, error: 'not approved' };
      const pin = newPin();
      try { await q(`UPDATE stores SET status = 'Approved', pinhash = $2, updated = $3 WHERE id = $1`, [id, hash(st.phone, pin), Date.now()]); }
      catch (e) { if (e && String(e.code) === '23505') return { ok: false, error: 'already applied' }; throw e; }
      await clear('s' + ph(st.phone));
      return { ok: true, pin };
    }
    if (d.decision === 'reject' || d.decision === 'suspend') {
      await q(`UPDATE stores SET status = $2, pinhash = '', updated = $3 WHERE id = $1`, [id, d.decision === 'reject' ? 'Rejected' : 'Suspended', Date.now()]);
      return { ok: true };
    }
    return { ok: false, error: 'bad decision' };
  }
  return { ok: false, error: 'unknown action' };
}

/* ---------- entry ---------- */
const PUBLIC_WRITES = { order: 1, message: 1, signup: 1, store_apply: 1 };

async function handle(d, ip) {
  if (!d || typeof d !== 'object') return { ok: false, error: 'bad request' };
  if (PUBLIC_WRITES[d.type]) {
    const n = await hit('w' + ip, 60000);       // 40 public submissions per minute per IP
    if (n > 40) return { ok: false, error: 'slow down' };
  }
  switch (d.type) {
    case 'order': return addOrder(d);
    case 'message': return addMessage(d);
    case 'signup': return addSignup(d);
    case 'track': return track(d);
    case 'store_apply': return storeApply(d);
    case 'driver': return driverApi(d);
    case 'store': return storeApi(d);
    case 'admin': return admin(d, ip);
  }
  return { ok: false, error: 'unknown type' };
}

module.exports = { handle, hash, ph, STATUSES, adminKey };
