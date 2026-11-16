/**
 * VidhyaLabs backend (Google Apps Script). Stores orders, messages, signups, delivery drivers and
 * partner stores in the Google Sheet this script is attached to. See SETUP.md for the setup.
 * Set the script property ADMIN_KEY (Project Settings > Script properties) to your admin password.
 */
var ORDER_H = ['id', 'at', 'status', 'name', 'phone', 'area', 'address', 'payment', 'slot', 'when', 'notes', 'total', 'unpriced', 'items', 'updated', 'driver', 'store'];
var MSG_H = ['at', 'phone', 'name', 'from', 'text'];
var WAIT_H = ['at', 'name', 'phone', 'area', 'interests'];
var DRIVER_H = ['id', 'name', 'phone', 'pinhash', 'active', 'created'];
var STORE_H = ['id', 'at', 'status', 'name', 'owner', 'phone', 'area', 'address', 'categories', 'fssai', 'notes', 'pinhash', 'updated'];
var STATUSES = ['Placed', 'Confirmed', 'Ready for pickup', 'Out for delivery', 'Delivered', 'Cancelled'];
var LIMIT = 400;

/* ---------- helpers ---------- */
function sh_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName(name);
  if (!s) { s = ss.insertSheet(name); s.appendRow(headers); return s; }
  var have = s.getDataRange().getValues()[0] || [];
  for (var i = have.length; i < headers.length; i++) s.getRange(1, i + 1).setValue(headers[i]);
  return s;
}
function rows_(s) {
  var v = s.getDataRange().getValues(), h = v[0], out = [];
  for (var i = 1; i < v.length; i++) {
    var o = {}; for (var j = 0; j < h.length; j++) o[h[j]] = v[i][j];
    o._row = i + 1; out.push(o);
  }
  return out;
}
function ph_(p) { return String(p || '').replace(/\D/g, '').slice(-10); }
function str_(x, n) { return String(x == null ? '' : x).slice(0, n || 500); }
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function isAdmin_(key) { var k = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY'); return !!k && key === k; }
function newId_(prefix) { return prefix + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 36).toString(36).toUpperCase(); }
function newPin_() { return String(Math.floor(100000 + Math.random() * 900000)); }
function hash_(phone, pin) {
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'vl|' + ph_(phone) + '|' + String(pin));
  return b.map(function (x) { return ('0' + (x & 255).toString(16)).slice(-2); }).join('');
}
function cell_(s, row, headers, col, val) { s.getRange(row, headers.indexOf(col) + 1).setValue(val); }

/* Five wrong PINs lock that phone number for 15 minutes. */
function locked_(who) { return Number(CacheService.getScriptCache().get('f_' + who) || 0) >= 5; }
function fail_(who) { var c = CacheService.getScriptCache(); c.put('f_' + who, String(Number(c.get('f_' + who) || 0) + 1), 900); }
function clear_(who) { CacheService.getScriptCache().remove('f_' + who); }

function doGet() { return out_({ ok: true, service: 'vidhyalabs' }); }

function doPost(e) {
  var d;
  try { d = JSON.parse(e.postData.contents); } catch (x) { return out_({ ok: false, error: 'bad request' }); }
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    switch (d.type) {
      case 'order': return out_(addOrder_(d));
      case 'message': return out_(addMessage_(d));
      case 'signup': return out_(addSignup_(d));
      case 'track': return out_(track_(d));
      case 'store_apply': return out_(storeApply_(d));
      case 'driver': return out_(driverApi_(d));
      case 'store': return out_(storeApi_(d));
      case 'admin': return out_(admin_(d));
    }
    return out_({ ok: false, error: 'unknown type' });
  } catch (err) {
    return out_({ ok: false, error: 'server error' });
  } finally { lock.releaseLock(); }
}

/* ---------- customers ---------- */
function addOrder_(d) {
  var c = d.customer || {}, phone = ph_(c.phone), id = str_(d.id, 30);
  if (!id || phone.length !== 10 || !d.lines || !d.lines.length) return { ok: false, error: 'invalid order' };
  var s = sh_('Orders', ORDER_H);
  var exists = rows_(s).some(function (r) { return r.id === id; });
  if (exists) return { ok: true, duplicate: true };
  var items = d.lines.slice(0, 60).map(function (l) { return { text: str_(l.text, 200) }; });
  s.appendRow([id, Date.now(), 'Placed', str_(c.name, 80), "'" + phone, str_(c.area, 60), str_(c.address, 300), str_(d.payment, 40), str_(d.slot, 60),
    str_(d.when, 80), str_(d.notes, 300), Number(d.total) || 0, Number(d.unpriced) || 0, JSON.stringify(items), Date.now(), '', '']);
  return { ok: true };
}

function addMessage_(d) {
  var c = d.customer || {}, phone = ph_(c.phone), text = str_(d.text, 1000).trim();
  if (phone.length !== 10 || !text) return { ok: false, error: 'invalid message' };
  sh_('Messages', MSG_H).appendRow([Date.now(), "'" + phone, str_(c.name, 80), 'customer', text]);
  return { ok: true };
}

function addSignup_(d) {
  var phone = ph_(d.phone);
  if (phone.length !== 10) return { ok: false, error: 'invalid signup' };
  sh_('Waitlist', WAIT_H).appendRow([Date.now(), str_(d.name, 80), "'" + phone, str_(d.area, 80), (d.interests || []).join(', ')]);
  return { ok: true };
}

/** Customer app asks for the status of its own orders and replies from the team. */
function track_(d) {
  var phone = ph_(d.phone), ids = (d.ids || []).slice(0, 40), res = { ok: true, orders: {}, replies: [] };
  if (phone.length !== 10) return { ok: false, error: 'invalid phone' };
  rows_(sh_('Orders', ORDER_H)).forEach(function (r) {
    if (ids.indexOf(r.id) > -1 && ph_(r.phone) === phone) res.orders[r.id] = r.status;
  });
  rows_(sh_('Messages', MSG_H)).forEach(function (m) {
    if (m.from === 'team' && ph_(m.phone) === phone) res.replies.push({ at: Number(m.at), text: m.text });
  });
  res.replies = res.replies.slice(-50);
  return res;
}

/* ---------- partner stores ---------- */
function storeApply_(d) {
  var name = str_(d.name, 100).trim(), owner = str_(d.owner, 80).trim(), phone = ph_(d.phone), area = str_(d.area, 80).trim(), address = str_(d.address, 300).trim();
  if (name.length < 2 || owner.length < 2 || phone.length !== 10 || !area || !address) return { ok: false, error: 'invalid' };
  var s = sh_('Stores', STORE_H);
  var dup = rows_(s).some(function (r) { return ph_(r.phone) === phone && (r.status === 'Pending' || r.status === 'Approved'); });
  if (dup) return { ok: false, error: 'already applied' };
  var cats = (d.categories || []).slice(0, 12).map(function (x) { return str_(x, 40); }).join(', ');
  s.appendRow([newId_('S'), Date.now(), 'Pending', name, owner, "'" + phone, area, address, cats, str_(d.fssai, 40), str_(d.notes, 400), '', Date.now()]);
  return { ok: true };
}

function authStore_(d) {
  var phone = ph_(d.phone), pin = String(d.pin || '');
  if (phone.length !== 10 || !pin) return null;
  var who = 's' + phone;
  if (locked_(who)) return { locked: true };
  var found = null;
  rows_(sh_('Stores', STORE_H)).forEach(function (r) {
    if (ph_(r.phone) === phone && r.status === 'Approved' && r.pinhash && r.pinhash === hash_(phone, pin)) found = r;
  });
  if (!found) { fail_(who); return null; }
  clear_(who); return found;
}

function storeApi_(d) {
  var st = authStore_(d);
  if (st && st.locked) return { ok: false, error: 'locked' };
  if (!st) return { ok: false, error: 'auth' };
  var s = sh_('Orders', ORDER_H);
  if (d.action === 'list') {
    var orders = rows_(s).filter(function (r) { return r.store === st.id && r.status !== 'Cancelled' && (r.status !== 'Delivered' || Date.now() - Number(r.updated) < 2 * 86400000); })
      .slice(-LIMIT).reverse().map(function (r) {
        var items = []; try { items = JSON.parse(r.items); } catch (x) {}
        // stores see what to pack, not who the customer is
        return { id: r.id, at: Number(r.at), status: r.status, area: r.area, slot: r.slot, lines: items };
      });
    return { ok: true, store: { name: st.name }, orders: orders };
  }
  if (d.action === 'ready') {
    var found = null; rows_(s).forEach(function (r) { if (r.id === d.id && r.store === st.id) found = r; });
    if (!found) return { ok: false, error: 'not found' };
    if (found.status !== 'Placed' && found.status !== 'Confirmed') return { ok: false, error: 'not allowed' };
    cell_(s, found._row, ORDER_H, 'status', 'Ready for pickup'); cell_(s, found._row, ORDER_H, 'updated', Date.now());
    return { ok: true };
  }
  return { ok: false, error: 'unknown action' };
}

/* ---------- delivery drivers ---------- */
function authDriver_(d) {
  var phone = ph_(d.phone), pin = String(d.pin || '');
  if (phone.length !== 10 || !pin) return null;
  var who = 'd' + phone;
  if (locked_(who)) return { locked: true };
  var found = null;
  rows_(sh_('Drivers', DRIVER_H)).forEach(function (r) {
    if (ph_(r.phone) === phone && r.active === 'yes' && r.pinhash === hash_(phone, pin)) found = r;
  });
  if (!found) { fail_(who); return null; }
  clear_(who); return found;
}

function driverApi_(d) {
  var dr = authDriver_(d);
  if (dr && dr.locked) return { ok: false, error: 'locked' };
  if (!dr) return { ok: false, error: 'auth' };
  var s = sh_('Orders', ORDER_H);
  if (d.action === 'list') {
    var orders = rows_(s).filter(function (r) { return r.driver === dr.id && r.status !== 'Cancelled' && (r.status !== 'Delivered' || Date.now() - Number(r.updated) < 2 * 86400000); })
      .slice(-LIMIT).reverse().map(function (r) {
        var items = []; try { items = JSON.parse(r.items); } catch (x) {}
        return { id: r.id, at: Number(r.at), status: r.status, payment: r.payment, slot: r.slot, when: r.when, notes: r.notes, total: Number(r.total), unpriced: Number(r.unpriced), lines: items,
          customer: { name: r.name, phone: ph_(r.phone), area: r.area, address: r.address } };
      });
    return { ok: true, driver: { name: dr.name }, orders: orders };
  }
  if (d.action === 'status') {
    if (d.status !== 'Out for delivery' && d.status !== 'Delivered') return { ok: false, error: 'bad status' };
    var found = null; rows_(s).forEach(function (r) { if (r.id === d.id && r.driver === dr.id) found = r; });
    if (!found) return { ok: false, error: 'not found' };
    if (found.status === 'Cancelled') return { ok: false, error: 'cancelled' };
    cell_(s, found._row, ORDER_H, 'status', d.status); cell_(s, found._row, ORDER_H, 'updated', Date.now());
    return { ok: true };
  }
  return { ok: false, error: 'unknown action' };
}

/* ---------- admin ---------- */
function admin_(d) {
  if (!isAdmin_(d.key)) return { ok: false, error: 'auth' };
  var s;
  if (d.action === 'list') {
    var orders = rows_(sh_('Orders', ORDER_H)).slice(-LIMIT).reverse().map(function (r) {
      var items = []; try { items = JSON.parse(r.items); } catch (x) {}
      return { id: r.id, at: Number(r.at), status: r.status, payment: r.payment, slot: r.slot, when: r.when, notes: r.notes,
        total: Number(r.total), unpriced: Number(r.unpriced), lines: items, driver: r.driver || '', store: r.store || '',
        customer: { name: r.name, phone: ph_(r.phone), area: r.area, address: r.address } };
    });
    var messages = rows_(sh_('Messages', MSG_H)).slice(-LIMIT).map(function (m) {
      return { at: Number(m.at), phone: ph_(m.phone), name: m.name, from: m.from, text: m.text };
    });
    var waitlist = rows_(sh_('Waitlist', WAIT_H)).slice(-LIMIT).reverse().map(function (w) {
      return { at: Number(w.at), name: w.name, phone: ph_(w.phone), area: w.area, interests: String(w.interests || '').split(', ').filter(Boolean) };
    });
    var drivers = rows_(sh_('Drivers', DRIVER_H)).map(function (r) { return { id: r.id, name: r.name, phone: ph_(r.phone), active: r.active === 'yes' }; });
    var stores = rows_(sh_('Stores', STORE_H)).reverse().map(function (r) {
      return { id: r.id, at: Number(r.at), status: r.status, name: r.name, owner: r.owner, phone: ph_(r.phone), area: r.area, address: r.address,
        categories: String(r.categories || '').split(', ').filter(Boolean), fssai: r.fssai, notes: r.notes };
    });
    return { ok: true, orders: orders, messages: messages, waitlist: waitlist, drivers: drivers, stores: stores, statuses: STATUSES };
  }
  if (d.action === 'status') {
    if (STATUSES.indexOf(d.status) < 0) return { ok: false, error: 'bad status' };
    s = sh_('Orders', ORDER_H);
    var found = null; rows_(s).forEach(function (r) { if (r.id === d.id) found = r; });
    if (!found) return { ok: false, error: 'not found' };
    cell_(s, found._row, ORDER_H, 'status', d.status); cell_(s, found._row, ORDER_H, 'updated', Date.now());
    return { ok: true };
  }
  if (d.action === 'assign') {
    s = sh_('Orders', ORDER_H);
    var o = null; rows_(s).forEach(function (r) { if (r.id === d.id) o = r; });
    if (!o) return { ok: false, error: 'not found' };
    var drv = str_(d.driver, 30), sto = str_(d.store, 30);
    if (drv && !rows_(sh_('Drivers', DRIVER_H)).some(function (r) { return r.id === drv && r.active === 'yes'; })) return { ok: false, error: 'unknown driver' };
    if (sto && !rows_(sh_('Stores', STORE_H)).some(function (r) { return r.id === sto && r.status === 'Approved'; })) return { ok: false, error: 'unknown store' };
    cell_(s, o._row, ORDER_H, 'driver', drv); cell_(s, o._row, ORDER_H, 'store', sto); cell_(s, o._row, ORDER_H, 'updated', Date.now());
    return { ok: true };
  }
  if (d.action === 'reply') {
    var phone = ph_(d.phone), text = str_(d.text, 1000).trim();
    if (phone.length !== 10 || !text) return { ok: false, error: 'invalid reply' };
    sh_('Messages', MSG_H).appendRow([Date.now(), "'" + phone, str_(d.name, 80), 'team', text]);
    return { ok: true };
  }
  if (d.action === 'driverSave') {
    s = sh_('Drivers', DRIVER_H);
    var name = str_(d.name, 80).trim(), dphone = ph_(d.phone), pin = null;
    if (name.length < 2 || dphone.length !== 10) return { ok: false, error: 'invalid driver' };
    var all = rows_(s), me = null;
    all.forEach(function (r) { if (d.id && r.id === d.id) me = r; });
    if (all.some(function (r) { return ph_(r.phone) === dphone && (!me || r.id !== me.id); })) return { ok: false, error: 'phone already used' };
    var active = d.active === false ? 'no' : 'yes';
    if (!me) {
      pin = newPin_(); var id = newId_('D');
      s.appendRow([id, name, "'" + dphone, hash_(dphone, pin), active, Date.now()]);
      return { ok: true, id: id, pin: pin };
    }
    cell_(s, me._row, DRIVER_H, 'name', name); cell_(s, me._row, DRIVER_H, 'phone', "'" + dphone); cell_(s, me._row, DRIVER_H, 'active', active);
    if (d.resetPin || ph_(me.phone) !== dphone) { pin = newPin_(); cell_(s, me._row, DRIVER_H, 'pinhash', hash_(dphone, pin)); }
    return { ok: true, id: me.id, pin: pin };
  }
  if (d.action === 'storeDecide') {
    s = sh_('Stores', STORE_H);
    var st = null; rows_(s).forEach(function (r) { if (r.id === d.id) st = r; });
    if (!st) return { ok: false, error: 'not found' };
    if (d.decision === 'approve' || d.decision === 'resetpin') {
      if (d.decision === 'resetpin' && st.status !== 'Approved') return { ok: false, error: 'not approved' };
      var spin = newPin_();
      cell_(s, st._row, STORE_H, 'status', 'Approved'); cell_(s, st._row, STORE_H, 'pinhash', hash_(st.phone, spin)); cell_(s, st._row, STORE_H, 'updated', Date.now());
      return { ok: true, pin: spin };
    }
    if (d.decision === 'reject' || d.decision === 'suspend') {
      cell_(s, st._row, STORE_H, 'status', d.decision === 'reject' ? 'Rejected' : 'Suspended'); cell_(s, st._row, STORE_H, 'pinhash', ''); cell_(s, st._row, STORE_H, 'updated', Date.now());
      return { ok: true };
    }
    return { ok: false, error: 'bad decision' };
  }
  return { ok: false, error: 'unknown action' };
}
