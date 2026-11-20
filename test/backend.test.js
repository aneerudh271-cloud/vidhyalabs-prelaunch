'use strict';
const assert = require('assert');
const { PGlite } = require('@electric-sql/pglite');
process.env.ADMIN_KEY = 'test-admin-key';
const db = require('../lib/db');
const api = require('../api/index.js');

(async () => {
  const pg = new PGlite();
  db.setQuery(async (t, p) => (await pg.query(t, p || [])).rows);
  let ipn = 0;
  async function call(body, ip) {
    let out;
    const req = { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'x-forwarded-for': ip || '9.9.9.' + (++ipn) } };
    const res = { setHeader() {}, end(s) { out = JSON.parse(s); } };
    await api(req, res); return out;
  }
  const A = (action, p, ip) => call(Object.assign({ type: 'admin', key: 'test-admin-key', action }, p), ip);
  let n = 0; const ok = (m) => console.log('ok ', ++n, m);

  // health
  let h; await api({ method: 'GET', url: '/api?db=1', headers: {} }, { setHeader() {}, end(s) { h = JSON.parse(s); } });
  assert(h.ok && h.database === 'connected' && h.admin === 'configured'); ok('health');

  // order + duplicate + validation
  const order = { type: 'order', id: 'VLTEST1', customer: { name: 'Asha', phone: '+91 98765 43210', area: 'Indus Town', address: 'B-12' }, payment: 'Cash on delivery', slot: '6–8am', when: 'Tomorrow', notes: 'ring bell', total: 66, unpriced: 1, lines: [{ text: '2 × Boiled milk 500 ml' }, { text: '1 kg Tomato' }] };
  assert.deepStrictEqual(await call(order), { ok: true }); ok('order saved');
  assert.strictEqual((await call(order)).duplicate, true); ok('duplicate order ignored');
  assert.strictEqual((await call({ type: 'order', id: 'X', customer: { phone: '123' }, lines: [{ text: 'a' }] })).error, 'invalid order'); ok('bad order rejected');
  assert.strictEqual((await call('not json')).error, 'bad request'); ok('bad json');
  assert.strictEqual((await call({ type: 'nope' })).error, 'unknown type'); ok('unknown type');

  // message, signup, track
  assert((await call({ type: 'message', customer: { phone: '9876543210', name: 'Asha' }, text: 'hello team' })).ok); ok('message');
  assert((await call({ type: 'signup', name: 'Ravi', phone: '9000000001', area: 'Krishnapuram', interests: ['Milk', 'Vegetables'] })).ok); ok('signup');
  assert.strictEqual((await call({ type: 'signup', phone: '12' })).ok, false); ok('bad signup');
  let t = await call({ type: 'track', phone: '9876543210', ids: ['VLTEST1', 'NOPE'] });
  assert.deepStrictEqual(t.orders, { VLTEST1: 'Placed' }); assert.strictEqual(t.replies.length, 0); ok('track own order');
  t = await call({ type: 'track', phone: '9111111111', ids: ['VLTEST1'] });
  assert.deepStrictEqual(t.orders, {}); ok("track can't see someone else's order");

  // admin auth + lockout
  assert.strictEqual((await call({ type: 'admin', key: 'wrong', action: 'list' }, '1.1.1.1')).error, 'auth'); ok('admin wrong key');
  for (let i = 0; i < 9; i++) await call({ type: 'admin', key: 'wrong', action: 'list' }, '1.1.1.1');
  assert.strictEqual((await call({ type: 'admin', key: 'test-admin-key', action: 'list' }, '1.1.1.1')).error, 'locked'); ok('admin lockout after 10 wrong keys (per IP)');
  assert((await A('list', {}, '2.2.2.2')).ok); ok('admin ok from another IP');

  // admin list + status + reply
  let L = await A('list');
  assert.strictEqual(L.orders.length, 1); assert.strictEqual(L.orders[0].customer.phone, '9876543210'); assert.strictEqual(L.orders[0].lines.length, 2); assert.strictEqual(L.orders[0].when, 'Tomorrow');
  assert.strictEqual(L.messages.length, 1); assert.strictEqual(L.waitlist[0].interests.length, 2); ok('admin list');
  assert((await A('status', { id: 'VLTEST1', status: 'Confirmed' })).ok); ok('admin status');
  assert.strictEqual((await A('status', { id: 'VLTEST1', status: 'Bogus' })).error, 'bad status'); ok('bad status');
  assert.strictEqual((await A('status', { id: 'NOPE', status: 'Confirmed' })).error, 'not found'); ok('status not found');
  assert((await A('reply', { phone: '9876543210', name: 'Asha', text: 'On our way' })).ok); ok('admin reply');
  t = await call({ type: 'track', phone: '9876543210', ids: ['VLTEST1'] });
  assert.strictEqual(t.orders.VLTEST1, 'Confirmed'); assert.strictEqual(t.replies[0].text, 'On our way'); ok('customer sees status + reply');

  // drivers
  let r = await A('driverSave', { name: 'Mohan', phone: '9822222222' });
  assert(r.ok && /^\d{6}$/.test(r.pin)); const drv = r.id, dpin = r.pin; ok('driver created with PIN');
  assert.strictEqual((await A('driverSave', { name: 'Other', phone: '9822222222' })).error, 'phone already used'); ok('duplicate driver phone');
  assert.strictEqual((await call({ type: 'driver', phone: '9822222222', pin: '000000', action: 'list' })).error, 'auth'); ok('driver wrong pin');
  let dl = await call({ type: 'driver', phone: '9822222222', pin: dpin, action: 'list' });
  assert(dl.ok && dl.orders.length === 0); ok('driver sees nothing before assignment');

  // store apply/approve
  const app = { type: 'store_apply', name: 'Sharma Dairy', owner: 'R Sharma', phone: '9833333333', area: 'Radhapuram', address: 'Shop 4', categories: ['Milk & dairy', 'Groceries'] };
  assert((await call(app)).ok); ok('store application');
  assert.strictEqual((await call(app)).error, 'already applied'); ok('duplicate application blocked');
  L = await A('list'); const sid = L.stores[0].id; assert.strictEqual(L.stores[0].status, 'Pending'); assert.strictEqual(L.stores[0].categories.length, 2);
  assert.strictEqual((await call({ type: 'store', phone: '9833333333', pin: '123456', action: 'list' })).error, 'auth'); ok('pending store cannot sign in');
  r = await A('storeDecide', { id: sid, decision: 'approve' }); assert(r.ok && r.pin); const spin = r.pin; ok('store approved');

  // assign
  assert.strictEqual((await A('assign', { id: 'VLTEST1', driver: 'DNOPE' })).error, 'unknown driver'); ok('unknown driver');
  assert((await A('assign', { id: 'VLTEST1', driver: drv, store: sid })).ok); ok('assigned driver + store');

  // store sees items only
  let sl = await call({ type: 'store', phone: '9833333333', pin: spin, action: 'list' });
  assert(sl.ok && sl.orders.length === 1 && sl.store.name === 'Sharma Dairy');
  const so = sl.orders[0]; assert.strictEqual(so.customer, undefined); assert.strictEqual(so.name, undefined); assert.strictEqual(so.phone, undefined); assert.strictEqual(so.address, undefined);
  assert.strictEqual(JSON.stringify(sl).includes('9876543210'), false); assert.strictEqual(JSON.stringify(sl).includes('B-12'), false); ok('store sees items/area only (no customer data)');
  assert((await call({ type: 'store', phone: '9833333333', pin: spin, action: 'ready', id: 'VLTEST1' })).ok); ok('store marks ready');
  assert.strictEqual((await call({ type: 'store', phone: '9833333333', pin: spin, action: 'ready', id: 'VLTEST1' })).error, 'not allowed'); ok('cannot mark ready twice');
  t = await call({ type: 'track', phone: '9876543210', ids: ['VLTEST1'] }); assert.strictEqual(t.orders.VLTEST1, 'Ready for pickup'); ok('customer sees Ready for pickup');

  // driver flow
  dl = await call({ type: 'driver', phone: '9822222222', pin: dpin, action: 'list' });
  assert.strictEqual(dl.orders.length, 1); assert.strictEqual(dl.orders[0].customer.address, 'B-12'); assert.strictEqual(dl.orders[0].total, 66); assert.strictEqual(dl.orders[0].unpriced, 1); ok('driver sees own order with address, cash and unpriced');
  assert.strictEqual((await call({ type: 'driver', phone: '9822222222', pin: dpin, action: 'status', id: 'VLTEST1', status: 'Cancelled' })).error, 'bad status'); ok('driver cannot cancel');
  assert((await call({ type: 'driver', phone: '9822222222', pin: dpin, action: 'status', id: 'VLTEST1', status: 'Out for delivery' })).ok);
  assert((await call({ type: 'driver', phone: '9822222222', pin: dpin, action: 'status', id: 'VLTEST1', status: 'Delivered' })).ok); ok('driver delivers');
  t = await call({ type: 'track', phone: '9876543210', ids: ['VLTEST1'] }); assert.strictEqual(t.orders.VLTEST1, 'Delivered'); ok('customer sees Delivered');

  // another driver cannot touch it; cancelled blocks driver
  r = await A('driverSave', { name: 'Sohan', phone: '9844444444' }); const d2 = r.pin;
  assert.strictEqual((await call({ type: 'driver', phone: '9844444444', pin: d2, action: 'status', id: 'VLTEST1', status: 'Delivered' })).error, 'not found'); ok("driver cannot touch another driver's order");
  await A('status', { id: 'VLTEST1', status: 'Cancelled' });
  assert.strictEqual((await call({ type: 'driver', phone: '9822222222', pin: dpin, action: 'status', id: 'VLTEST1', status: 'Delivered' })).error, 'cancelled'); ok('cancelled order blocks driver');

  // PIN lockout (per phone) + reset
  for (let i = 0; i < 5; i++) await call({ type: 'driver', phone: '9844444444', pin: 'bad', action: 'list' });
  assert.strictEqual((await call({ type: 'driver', phone: '9844444444', pin: d2, action: 'list' })).error, 'locked'); ok('driver locked after 5 wrong PINs');
  r = await A('driverSave', { id: L.drivers && undefined, name: 'Sohan', phone: '9844444444' }); // new id missing -> clash
  const all = (await A('list')).drivers; const sohan = all.find(x => x.phone === '9844444444');
  r = await A('driverSave', { id: sohan.id, name: 'Sohan', phone: '9844444444', resetPin: true }); assert(r.ok && r.pin);
  assert((await call({ type: 'driver', phone: '9844444444', pin: r.pin, action: 'list' })).ok); ok('PIN reset clears lock');
  assert((await A('driverSave', { id: sohan.id, name: 'Sohan', phone: '9844444444', active: false })).ok);
  assert.strictEqual((await call({ type: 'driver', phone: '9844444444', pin: r.pin, action: 'list' })).error, 'auth'); ok('deactivated driver blocked');

  // suspend store
  assert((await A('storeDecide', { id: sid, decision: 'suspend' })).ok);
  assert.strictEqual((await call({ type: 'store', phone: '9833333333', pin: spin, action: 'list' })).error, 'auth'); ok('suspended store blocked');
  assert.strictEqual((await A('storeDecide', { id: sid, decision: 'resetpin' })).error, 'not approved'); ok('resetpin needs approved');
  assert((await call(Object.assign({}, app, { phone: '9833333333' }))).ok); ok('suspended store can re-apply');

  // public write rate limit
  let blocked = false;
  for (let i = 0; i < 45; i++) { const x = await call({ type: 'signup', phone: '9000000002' }, '7.7.7.7'); if (x.error === 'slow down') blocked = true; }
  assert(blocked); ok('public writes rate limited per IP');

  // google login + mobile required (mocked Google keys)
  {
    const crypto = require('crypto'), auth = require('../lib/auth');
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = Object.assign(publicKey.export({ format: 'jwk' }), { kid: 'k1', alg: 'RS256', use: 'sig' });
    auth.setKeyFetcher(async () => [jwk]);
    const mk = (over, key) => { const b = o => Buffer.from(JSON.stringify(o)).toString('base64url'); const h = b({ alg: 'RS256', kid: 'k1' }), p = b(Object.assign({ iss: 'https://accounts.google.com', aud: 'cid.apps.googleusercontent.com', sub: '123', email: 'a@x.com', email_verified: true, name: 'Asha Rao', exp: Math.floor(Date.now() / 1000) + 600 }, over)); return h + '.' + p + '.' + crypto.createSign('RSA-SHA256').update(h + '.' + p).sign(key || privateKey).toString('base64url'); };
    const o1 = { type: 'order', id: 'VLG1', customer: { name: 'Asha', phone: '9876543210', area: 'Indus Town', address: 'B-12' }, lines: [{ text: 'Milk' }] };
    assert.strictEqual((await call(o1)).ok, true); ok('orders open while google login is not configured');
    process.env.GOOGLE_CLIENT_ID = 'cid.apps.googleusercontent.com';
    assert.strictEqual((await call(Object.assign({}, o1, { id: 'VLG2' }))).error, 'login required'); ok('order without login blocked');
    assert.strictEqual((await call({ type: 'login', idToken: mk({ aud: 'other' }) })).error, 'login failed'); ok('wrong audience rejected');
    assert.strictEqual((await call({ type: 'login', idToken: mk({ exp: 1 }) })).error, 'login failed'); ok('expired token rejected');
    assert.strictEqual((await call({ type: 'login', idToken: mk({}, crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey) })).error, 'login failed'); ok('forged signature rejected');
    assert.strictEqual((await call({ type: 'login', idToken: mk({ iss: 'https://evil.com' }) })).error, 'login failed'); ok('wrong issuer rejected');
    const li = await call({ type: 'login', idToken: mk({}) });
    assert(li.ok && li.session && li.user.email === 'a@x.com' && li.user.phone === ''); ok('google login creates account');
    assert.strictEqual((await call(Object.assign({}, o1, { id: 'VLG3', session: li.session }))).error, 'mobile required'); ok('order blocked until mobile added');
    assert.strictEqual((await call({ type: 'account', session: li.session, phone: '12345' })).error, 'invalid mobile'); ok('bad mobile rejected');
    assert.strictEqual((await call({ type: 'account', session: li.session, phone: '5876543210' })).error, 'invalid mobile'); ok('non-Indian mobile prefix rejected');
    assert.strictEqual((await call({ type: 'account', session: 'x.y', phone: '9876543210' })).error, 'login required'); ok('bad session rejected');
    const ac = await call({ type: 'account', session: li.session, phone: '+91 98765 43210' });
    assert(ac.ok && ac.user.phone === '9876543210'); ok('mobile saved');
    assert.deepStrictEqual(await call(Object.assign({}, o1, { id: 'VLG4', session: li.session, customer: Object.assign({}, o1.customer, { phone: '1111111111' }) })), { ok: true }); ok('order accepted with login + mobile');
    const rows = await A('list'); const g4 = JSON.stringify(rows).includes('VLG4');
    assert(g4); ok('order visible to admin');
    const li2 = await call({ type: 'login', idToken: mk({}) });
    assert.strictEqual(li2.user.phone, '9876543210'); ok('mobile remembered on next login');
    delete process.env.GOOGLE_CLIENT_ID;
    let hh; await api({ method: 'GET', url: '/api', headers: {} }, { setHeader() {}, end(s) { hh = JSON.parse(s); } });
    assert.strictEqual(hh.google, 'missing'); ok('health reports google off');
  }

  // no admin key configured
  delete process.env.ADMIN_KEY;
  assert.strictEqual((await call({ type: 'admin', key: '', action: 'list' }, '3.3.3.3')).error, 'auth'); ok('no ADMIN_KEY set -> admin disabled');
  console.log('\nALL PASSED (' + n + ')'); process.exit(0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
