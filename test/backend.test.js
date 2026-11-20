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

  // shop self-onboarding: own PIN, pending sign-in, products
  {
    const ap = { type: 'store_apply', name: 'Gupta Fresh', owner: 'A Gupta', phone: '9844444444', area: 'Arera Colony', address: 'Shop 9', categories: ['Vegetables'], pin: '482913' };
    assert.strictEqual((await call(Object.assign({}, ap, { pin: '12' }))).error, 'invalid pin'); ok('bad shop PIN rejected');
    assert((await call(ap)).ok); ok('shop applies with its own PIN');
    const S = (action, p) => call(Object.assign({ type: 'store', phone: '9844444444', pin: '482913', action }, p || {}));
    let m = await S('me'); assert(m.ok && m.store.status === 'Pending'); ok('pending shop can sign in and sees status');
    assert.strictEqual((await S('item_save', { item: { name: 'Tomato', price: 30, stock: 5 } })).error, 'not approved'); ok('pending shop cannot add products yet');
    assert.strictEqual((await call({ type: 'store', phone: '9844444444', pin: '000000', action: 'me' })).error, 'auth'); ok('wrong shop PIN rejected');
    const gid = (await A('list')).stores.find(x => x.phone === '9844444444').id;
    let ar = await A('storeDecide', { id: gid, decision: 'approve' }); assert(ar.ok && ar.selfPin && !ar.pin); ok('admin approves, shop keeps its own PIN');
    m = await S('me'); assert.strictEqual(m.store.status, 'Approved'); ok('shop now approved');
    const sv = await S('item_save', { item: { id: 'v-tomato', name: 'Tomato', variant: '1 kg', price: 32.5, stock: 40 } }); assert(sv.ok && sv.id === 'v-tomato'); ok('shop adds a catalogue product');
    const cu = await S('item_save', { item: { name: 'Fresh coriander', variant: 'bunch', price: 10, stock: 15 } }); assert(cu.ok && cu.id.startsWith('c')); ok('shop adds its own product');
    assert.strictEqual((await S('item_save', { item: { name: 'X', price: -1, stock: 1 } })).error, 'invalid item'); ok('negative price rejected');
    assert.strictEqual((await S('item_save', { item: { name: 'Okra', price: 20, stock: 1.5 } })).error, 'invalid item'); ok('fractional stock rejected');
    await S('item_save', { item: { id: 'v-tomato', name: 'Tomato', variant: '1 kg', price: 35, stock: 0, available: false } });
    let it = await S('items'); assert(it.ok && it.items.length === 2); const t = it.items.find(x => x.id === 'v-tomato'); assert(t.price === 35 && t.stock === 0 && t.available === false); ok('shop updates price, stock, availability');
    await call({ type: 'store_apply', name: 'Verma Mart', owner: 'S Verma', phone: '9855555555', area: 'MP Nagar', address: 'Shop 2', pin: '135790' });
    await A('storeDecide', { id: (await A('list')).stores.find(x => x.phone === '9855555555').id, decision: 'approve' });
    const other = await call({ type: 'store', phone: '9855555555', pin: '135790', action: 'items' }); assert(other.ok && other.items.length === 0); ok('shops cannot see each other\'s products');
    assert((await S('item_delete', { id: cu.id })).ok); assert.strictEqual((await S('items')).items.length, 1); ok('shop removes a product');
    await A('storeDecide', { id: gid, decision: 'suspend' });
    assert.strictEqual((await S('me')).error, 'auth'); ok('suspended shop locked out');
  }

  // admin adds / edits shops directly
  {
    const base = { name: 'Raj Kirana', owner: 'Raj', phone: '9866666666', area: 'Kolar Road', address: 'Shop 7' };
    assert.strictEqual((await A('storeSave', { name: 'R' })).error, 'invalid store'); ok('store add validates');
    const sa = await A('storeSave', base); assert(sa.ok && sa.id && /^\d{6}$/.test(sa.pin)); ok('admin adds a store with a PIN');
    assert.strictEqual((await A('storeSave', base)).error, 'phone already used'); ok('duplicate store phone rejected');
    const sl2 = await call({ type: 'store', phone: '9866666666', pin: sa.pin, action: 'me' }); assert(sl2.ok && sl2.store.status === 'Approved'); ok('added store signs in at once');
    assert((await call({ type: 'store', phone: '9866666666', pin: sa.pin, action: 'item_save', item: { name: 'Atta', variant: '5 kg', price: 240, stock: 12 } })).ok); ok('added store can list products');
    const lst = (await A('list')).stores.find(x => x.id === sa.id); assert(lst.items === 1 && lst.status === 'Approved'); ok('admin list shows product count');
    const ed = await A('storeSave', Object.assign({}, base, { id: sa.id, name: 'Raj Kirana & General', area: 'MP Nagar' })); assert(ed.ok && !ed.pin); ok('admin edits store without changing PIN');
    assert((await call({ type: 'store', phone: '9866666666', pin: sa.pin, action: 'me' })).ok); ok('PIN still works after edit');
    const ph2 = await A('storeSave', Object.assign({}, base, { id: sa.id, phone: '9877777777' })); assert(ph2.ok && /^\d{6}$/.test(ph2.pin)); ok('changing phone issues a new PIN');
    assert.strictEqual((await call({ type: 'store', phone: '9866666666', pin: sa.pin, action: 'me' })).error, 'auth'); ok('old phone/PIN stops working');
    assert.strictEqual((await A('storeSave', Object.assign({}, base, { id: 'S-nope' }))).error, 'not found'); ok('edit unknown store rejected');
  }

  // shop self-service profile / PIN; admin delete
  {
    const sa = await A('storeSave', { name: 'Self Edit Store', owner: 'Se', phone: '9801010101', area: 'Piplani', address: 'Shop 1' });
    const S2 = (action, p) => call(Object.assign({ type: 'store', phone: '9801010101', pin: sa.pin, action }, p || {}));
    const pr = await S2('profile'); assert(pr.ok && pr.profile.name === 'Self Edit Store' && pr.profile.area === 'Piplani'); ok('shop reads its profile');
    assert.strictEqual((await S2('profile_save', { name: 'S', owner: 'x', new_phone: '9801010101', area: 'Piplani', address: 'a' })).error, 'invalid'); ok('shop profile validates');
    let ps = await S2('profile_save', { name: 'Self Edit Store 2', owner: 'Se', new_phone: '9801010101', area: 'Karond', address: 'Shop 2', fssai: '123', categories: ['Fruits'] });
    assert(ps.ok && !ps.phoneChanged); ok('shop edits its own details');
    const got = (await A('list')).stores.find(x => x.id === sa.id); assert(got.name === 'Self Edit Store 2' && got.area === 'Karond' && got.categories[0] === 'Fruits'); ok('admin sees the shop edit');
    assert.strictEqual((await S2('profile_save', { name: 'Self Edit Store 2', owner: 'Se', new_phone: '9833333333', area: 'Karond', address: 'x' })).error, 'phone already used'); ok('shop cannot take another shop\'s phone');
    assert.strictEqual((await S2('pin_change', { new_pin: '12ab' })).error, 'invalid pin'); ok('bad new PIN rejected');
    assert((await S2('pin_change', { new_pin: '246810' })).ok); ok('shop changes its PIN');
    assert.strictEqual((await S2('me')).error, 'auth'); ok('old PIN stops working');
    const S3 = (action, p) => call(Object.assign({ type: 'store', phone: '9801010101', pin: '246810', action }, p || {}));
    assert((await S3('me')).ok); ok('new PIN works');
    ps = await S3('profile_save', { name: 'Self Edit Store 2', owner: 'Se', new_phone: '9802020202', area: 'Karond', address: 'Shop 2' }); assert(ps.ok && ps.phoneChanged); ok('shop changes its login phone');
    assert((await call({ type: 'store', phone: '9802020202', pin: '246810', action: 'me' })).ok); ok('same PIN works with the new phone');
    // delete
    assert((await call({ type: 'store', phone: '9802020202', pin: '246810', action: 'item_save', item: { name: 'Rice', price: 50, stock: 3 } })).ok);
    assert.strictEqual((await A('storeDelete', { id: 'S-nope' })).error, 'not found'); ok('delete unknown store rejected');
    assert((await A('storeDelete', { id: sa.id })).ok); ok('admin deletes a store');
    assert.strictEqual((await call({ type: 'store', phone: '9802020202', pin: '246810', action: 'me' })).error, 'auth'); ok('deleted store cannot sign in');
    assert.strictEqual((await A('list')).stores.some(x => x.id === sa.id), false); ok('deleted store gone from admin list');
    const dd = await A('driverSave', { name: 'Del Rider', phone: '9803030303' });
    await call({ type: 'order', id: 'VLDEL1', customer: { name: 'A', phone: '9876543210', area: 'Indus Town', address: 'B' }, lines: [{ text: 'Milk' }] });
    await A('assign', { id: 'VLDEL1', driver: dd.id }); assert((await A('driverDelete', { id: dd.id })).ok); ok('admin deletes a rider');
    const od = (await A('list')).orders.find(x => x.id === 'VLDEL1'); assert(!od.driver); ok('open orders of a deleted rider are unassigned');
    assert.strictEqual((await call({ type: 'driver', phone: '9803030303', pin: dd.pin, action: 'list' })).error, 'auth'); ok('deleted rider cannot sign in');
    const er = await A('driverSave', { id: (await A('driverSave', { name: 'Edit Rider', phone: '9804040404' })).id, name: 'Edit Rider 2', phone: '9804040404' }); assert(er.ok && !er.pin); ok('admin edits rider name, PIN unchanged');
  }

  // no admin key configured
  delete process.env.ADMIN_KEY;
  assert.strictEqual((await call({ type: 'admin', key: '', action: 'list' }, '3.3.3.3')).error, 'auth'); ok('no ADMIN_KEY set -> admin disabled');
  console.log('\nALL PASSED (' + n + ')'); process.exit(0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
