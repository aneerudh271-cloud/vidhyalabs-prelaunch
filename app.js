(function () {
  'use strict';
  var VLd = window.VL, C = VLd.config, catalog = VLd.catalog, herd = VLd.herd;
  var screen = document.getElementById('screen');

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var store = {
    get: function (k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  function inr(n) { return '₹' + Number(n).toLocaleString('en-IN'); }
  function byId(id) { for (var i = 0; i < catalog.length; i++) if (catalog[i].id === id) return catalog[i]; }
  function toast(msg) { var t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 1800); }

  function icoHTML(it) { return it.img ? '<img src="' + it.img + '" alt="" loading="lazy">' : it.emoji; }
  function sendToTeam(type, payload) {
    if (!C.formEndpoint) return false;
    try { fetch(C.formEndpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, mode: 'no-cors', body: JSON.stringify(Object.assign({ type: type }, payload)) }).catch(function () {}); } catch (e) {}
    return true;
  }
  function api(payload) {
    if (!C.formEndpoint) return Promise.resolve(null);
    return fetch(C.formEndpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json(); }).catch(function () { return null; });
  }
  var messages = store.get('vl_msgs', []);
  var cart = store.get('vl_cart', []);
  var orders = store.get('vl_orders', []);
  var profile = store.get('vl_profile', {});
  var view = { shopCat: 'all', svcCat: 'all', q: '', just: null };
  var PLANS = ['Once', 'Daily', 'Weekly', 'Monthly'];

  function saveCart() { store.set('vl_cart', cart); badge(); }
  function badge() {
    var n = cart.reduce(function (a, l) { return a + l.qty; }, 0), b = document.getElementById('badge');
    b.textContent = n; b.classList.toggle('show', n > 0);
    if (typeof updateCartBar === 'function') updateCartBar();
  }
  function qtyOf(id) { for (var i = 0; i < cart.length; i++) if (cart[i].id === id) return cart[i].qty; return 0; }
  function change(id, d) {
    var line = null, idx = -1;
    for (var i = 0; i < cart.length; i++) if (cart[i].id === id) { line = cart[i]; idx = i; }
    if (!line && d > 0) { cart.push({ id: id, qty: 1, plan: 'Once', note: '' }); toast(byId(id).cat === 'milk' ? 'Milk added. Choose Monthly in your cart for a free lactometer kit' : byId(id).name + ' added'); }
    else if (line) { line.qty += d; if (line.qty <= 0) cart.splice(idx, 1); }
    saveCart();
  }

  /* ---------- install prompt ---------- */
  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; if (current() === 'home' || current() === 'me') render(); });
  var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  function installBlock() {
    if (isStandalone) return '';
    if (deferred) return '<div class="install"><p><b>Install VidhyaLabs</b><br>Add it to your home screen.</p><button class="btn btn-primary" data-act="install">Install</button></div>';
    if (isIOS) return '<div class="install"><p><b>Install on iPhone</b><br>Tap <b>Share</b>, then <b>Add to Home Screen</b>.</p></div>';
    return '';
  }

  /* ---------- catalog UI ---------- */
  function ctl(id) {
    var q = qtyOf(id);
    if (!q) return '<button class="add" data-act="inc" data-id="' + id + '">Add</button>';
    return '<div class="step-ctl"><button data-act="dec" data-id="' + id + '" aria-label="Remove one">−</button><span>' + q + '</span><button data-act="inc" data-id="' + id + '" aria-label="Add one">+</button></div>';
  }
  function priceHTML(it) {
    if (it.price == null) return '<span class="price q">Price confirmed by our team</span>';
    return '<span class="price">' + inr(it.price) + (it.unit ? ' <em>' + esc(it.unit) + '</em>' : '') + '</span>';
  }
  function itemHTML(it) {
    return '<div class="item"><div class="ico">' + icoHTML(it) + '</div><div class="meta"><b>' + esc(it.name) + '</b><small>' + esc(it.variant || '') + '</small>' + priceHTML(it) + '</div><div data-ctl="' + it.id + '">' + ctl(it.id) + '</div></div>';
  }
  function catalogScreen(kind) {
    var key = kind === 'goods' ? 'shopCat' : 'svcCat', cats = VLd.cats[kind];
    var q = view.q.trim().toLowerCase();
    var list = catalog.filter(function (i) {
      return i.kind === kind && (view[key] === 'all' || i.cat === view[key]) && (!q || (i.name + ' ' + i.variant).toLowerCase().indexOf(q) > -1);
    });
    var h = '<h2 class="s">' + (kind === 'goods' ? 'Shop daily essentials' : 'Home services') + '</h2>';
    h += '<input class="search" id="q" type="search" placeholder="Search" value="' + esc(view.q) + '" aria-label="Search">';
    h += '<div class="chips">' + cats.map(function (c) { return '<button data-act="cat" data-key="' + key + '" data-k="' + c.k + '" class="' + (view[key] === c.k ? 'on' : '') + '">' + c.l + '</button>'; }).join('') + '</div>';
    if (kind === 'goods' && (view.shopCat === 'milk' || view.shopCat === 'all') && !q) h += milkOffer(false);
    h += '<div id="list">' + (list.length ? list.map(itemHTML).join('') : '<div class="empty"><i>🔍</i>Nothing found. Message our team and we will help.</div>') + '</div>';
    if (kind === 'goods') h += '<p class="muted" style="font-size:.82rem">' + (view.shopCat === 'veg' || view.shopCat === 'fruit' ? 'Prices are per pack as listed. Fresh produce prices can change with the market, and our team confirms the final price with your order.' : 'Milk prices are fixed. For other items our team confirms the price with your order.') + '</p>';
    return h;
  }

  /* ---------- Herd Club: levels, streak, badges and your herd. Everything is derived from your own orders. ---------- */
  var LEVELS = [{ n: 0, name: 'Newcomer', ico: '🌱' }, { n: 1, name: 'Sprout', ico: '🌿' }, { n: 3, name: 'Regular', ico: '🥛' }, { n: 8, name: 'Herd Keeper', ico: '🐄' }, { n: 20, name: 'Herd Master', ico: '🏆' }];
  var BADGES = [
    { id: 'first', ico: '🛒', name: 'First order', hint: 'Place your first order' },
    { id: 'deliv', ico: '🚚', name: 'First delivery', hint: 'Get an order delivered' },
    { id: 'milk3', ico: '🥛', name: 'Milk lover', hint: 'Order milk 3 times' },
    { id: 'monthly', ico: '🧪', name: 'Monthly member', hint: 'Subscribe to milk monthly' },
    { id: 'fresh', ico: '🥬', name: 'Fresh pick', hint: 'Order vegetables or fruit' },
    { id: 'svc', ico: '🛠️', name: 'Home hero', hint: 'Book a home service' },
    { id: 'water', ico: '💧', name: 'Stay hydrated', hint: 'Order drinking water' },
    { id: 'streak3', ico: '🔥', name: '3-week streak', hint: 'Get a delivery 3 weeks in a row' }
  ];
  // the same shuffled order for everyone, so your herd grows in a fixed, repeatable sequence
  var herdOrder = (function () { var a = herd.slice(), seed = 20260; function r() { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; } for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; })();
  function animal(i) { return i % 2 ? '🐃' : '🐄'; }
  function weekOf(t) { var d = new Date(t); return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000 + 3 * 86400000) / 604800000); }
  function lineItems(o) { return (o.lines || []).map(function (l) { return { it: byId(l.id), plan: l.plan }; }).filter(function (x) { return x.it; }); }
  function gameStats() {
    var live = orders.filter(function (o) { return o.status !== 'Cancelled'; });
    var done = live.filter(function (o) { return o.status === 'Delivered'; });
    var has = function (o, f) { return lineItems(o).some(function (x) { return f(x.it, x.plan); }); };
    var weeks = {}; done.forEach(function (o) { weeks[weekOf(o.at)] = 1; });
    var w = weekOf(Date.now()), streak = 0; if (!weeks[w]) w--; while (weeks[w]) { streak++; w--; }
    var st = { placed: live.length, delivered: done.length, streak: streak };
    var li = 0; LEVELS.forEach(function (L, i) { if (st.delivered >= L.n) li = i; });
    st.level = LEVELS[li]; st.next = LEVELS[li + 1] || null;
    st.pct = st.next ? Math.round((st.delivered - st.level.n) / (st.next.n - st.level.n) * 100) : 100;
    var pending = live.length - done.length;
    st.nextName = herdOrder[(st.delivered + pending) % herdOrder.length];
    st.herd = herdOrder.slice(0, Math.min(done.length, herdOrder.length));
    var ok = {
      first: live.length >= 1, deliv: done.length >= 1,
      milk3: live.filter(function (o) { return has(o, function (i) { return i.cat === 'milk'; }); }).length >= 3,
      monthly: live.some(function (o) { return has(o, function (i, p) { return i.cat === 'milk' && p === 'Monthly'; }); }),
      fresh: live.some(function (o) { return has(o, function (i) { return i.cat === 'veg' || i.cat === 'fruit'; }); }),
      svc: live.some(function (o) { return has(o, function (i) { return i.kind === 'service'; }); }),
      water: live.some(function (o) { return has(o, function (i) { return i.cat === 'water'; }); }),
      streak3: streak >= 3
    };
    st.badges = BADGES.map(function (b) { return { b: b, on: !!ok[b.id] }; });
    return st;
  }
  function levelCard(st) {
    var more = st.next ? (st.next.n - st.delivered) : 0;
    return '<div class="lvl"><div class="lvl-top"><span class="lvl-chip">' + st.level.ico + ' ' + esc(st.level.name) + '</span>' +
      (st.streak ? '<span class="lvl-streak" title="Weeks in a row with a delivery">🔥 ' + st.streak + ' week' + (st.streak > 1 ? 's' : '') + '</span>' : '') + '</div>' +
      '<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + st.pct + '" aria-label="Progress to next level"><i style="width:' + Math.max(st.pct, 6) + '%"></i></div>' +
      '<small>' + (st.next ? (more === 1 ? '1 more delivery to reach ' : more + ' more deliveries to reach ') + esc(st.next.name) + ' ' + st.next.ico : 'Top level reached. Thank you for being part of the herd!') + '</small></div>';
  }
  function herdGrid(st) {
    if (!st.herd.length) return '<p class="muted" style="margin:0;font-size:.9rem">Your herd is empty. Each delivered order adopts a new cow or buffalo. Next up: <b>' + esc(st.nextName) + '</b> ' + animal(0) + '</p>';
    return '<div class="herd">' + st.herd.map(function (n, i) { return '<span class="cow"><i>' + animal(i) + '</i>' + esc(n) + '</span>'; }).join('') + '</div>' +
      '<p class="muted" style="margin:.6rem 0 0;font-size:.82rem">' + st.herd.length + ' of ' + herdOrder.length + ' herd members adopted. Next up: <b>' + esc(st.nextName) + '</b></p>';
  }
  function badgeGrid(st) {
    return '<div class="badges">' + st.badges.map(function (x) { return '<div class="bd' + (x.on ? ' on' : '') + '" title="' + esc(x.on ? x.b.name : x.b.hint) + '"><i>' + (x.on ? x.b.ico : '🔒') + '</i><b>' + esc(x.b.name) + '</b><small>' + (x.on ? 'Unlocked' : esc(x.b.hint)) + '</small></div>'; }).join('') + '</div>';
  }
  function confetti() {
    try { if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch (e) {}
    var box = document.createElement('div'); box.className = 'confetti'; box.setAttribute('aria-hidden', 'true');
    var bits = ['🎉', '✨', '🥛', '🐄', '🌿', '⭐'];
    for (var i = 0; i < 26; i++) { var b = document.createElement('span'); b.textContent = bits[i % bits.length]; b.style.left = (Math.random() * 100) + '%'; b.style.animationDelay = (Math.random() * .5) + 's'; b.style.animationDuration = (1.4 + Math.random() * 1.1) + 's'; b.style.fontSize = (14 + Math.random() * 14) + 'px'; box.appendChild(b); }
    document.body.appendChild(box); setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 3000);
  }
  /* Celebrate new herd members and badges once. First run records the current state silently. */
  function checkRewards() {
    var st = gameStats(), seen = store.get('vl_game', null), ids = st.badges.filter(function (x) { return x.on; }).map(function (x) { return x.b.id; });
    if (!seen) { store.set('vl_game', { badges: ids, herd: st.herd.length }); return; }
    var msgs = [];
    if (st.herd.length > seen.herd) msgs.push(animal(st.herd.length - 1) + ' ' + st.herd[st.herd.length - 1] + ' joined your herd!');
    st.badges.forEach(function (x) { if (x.on && seen.badges.indexOf(x.b.id) < 0) msgs.push(x.b.ico + ' Badge unlocked: ' + x.b.name); });
    store.set('vl_game', { badges: ids, herd: st.herd.length });
    if (!msgs.length) return;
    confetti(); toast(msgs[0]);
    msgs.slice(1, 3).forEach(function (m, i) { setTimeout(function () { toast(m); }, 2000 * (i + 1)); });
  }
  var STEPS = ['Placed', 'Confirmed', 'Ready for pickup', 'Out for delivery', 'Delivered'];
  function tracker(o) {
    var st = o.status || (o.sent ? 'Placed' : ''); if (!st || st === 'Cancelled') return '';
    var at = STEPS.indexOf(st); if (at < 0) return '';
    return '<ol class="track" aria-label="Order progress">' + STEPS.map(function (x, i) { return '<li class="' + (i < at ? 'done' : i === at ? 'now' : '') + '"><i></i><span>' + (x === 'Ready for pickup' ? 'Packed' : x === 'Out for delivery' ? 'On the way' : x) + '</span></li>'; }).join('') + '</ol>';
  }
  /* Cut-off countdown, so people know how long they have to order for the morning slot. */
  function cutoffHour() { var m = /(\d{1,2})\s*(am|pm)/i.exec(C.cutoff || ''); if (!m) return 21; var h = Number(m[1]) % 12; return /pm/i.test(m[2]) ? h + 12 : h; }
  function countdownText() {
    var now = new Date(), end = new Date(now); end.setHours(cutoffHour(), 0, 0, 0); var ms = end - now; if (ms <= 0) return '';
    var m = Math.floor(ms / 60000), h = Math.floor(m / 60); return '⏰ Order within ' + (h ? h + 'h ' : '') + (m % 60) + 'm for morning delivery';
  }
  function updateCountdowns() { document.querySelectorAll('[data-cd]').forEach(function (e) { var t = countdownText(); e.textContent = t; e.classList.toggle('hidden', !t); }); }
  function updateCartBar() {
    var bar = document.getElementById('cartbar'); if (!bar) return;
    var n = cart.reduce(function (a, l) { return a + l.qty; }, 0), t = cartTotals(), on = n > 0 && ['home', 'shop', 'services'].indexOf(current()) > -1;
    bar.classList.toggle('hidden', !on); if (!on) return;
    bar.innerHTML = '<span><b>' + n + ' item' + (n > 1 ? 's' : '') + '</b> · ' + inr(t.total) + (t.unpriced ? ' + ' + t.unpriced + ' to price' : '') + '</span><span class="go">View cart →</span>';
  }

  /* ---------- screens ---------- */
  var tickIdx = 0, tickTimer = null;
  function homeScreen() {
    var name = profile.name ? ', ' + esc(profile.name.split(' ')[0]) : '';
    var h = installBlock();
    var gs = gameStats();
    h += '<div class="hero-card"><h2>Hello' + name + ' 👋</h2><p>Order by ' + esc(C.cutoff) + ', get milk at your door by morning.</p>' + levelCard(gs) + '<div class="cd" data-cd></div><div class="tk">Today\'s milk comes from <b id="tk"></b></div></div>';
    if (!orders.length) h += '<div class="panel quest"><h3>🌱 Start your herd</h3><p class="muted" style="margin:0 0 .7rem;font-size:.9rem">Every delivered order adopts a cow or buffalo into your herd. Your first one is <b>' + esc(gs.nextName) + '</b> ' + animal(0) + '</p><button class="btn btn-primary btn-block" data-act="go" data-to="shop" data-cat="milk">Place my first order</button></div>';
    else if (gs.herd.length) h += '<div class="panel"><h3>🐄 Your herd <a class="more" href="#me">See all</a></h3><div class="herd">' + gs.herd.slice(-6).reverse().map(function (n, i) { return '<span class="cow"><i>' + animal(gs.herd.indexOf(n)) + '</i>' + esc(n) + '</span>'; }).join('') + '</div></div>';
    h += '<h2 class="s">What do you need?</h2><div class="tiles">' +
      '<button class="tile-b" data-act="go" data-to="shop" data-cat="milk"><i>🥛</i>Milk</button>' +
      '<button class="tile-b" data-act="go" data-to="shop" data-cat="veg"><i>🥬</i>Vegetables</button>' +
      '<button class="tile-b" data-act="go" data-to="shop" data-cat="fruit"><i>🍎</i>Fruits</button>' +
      '<button class="tile-b" data-act="go" data-to="shop" data-cat="groceries"><i>🛒</i>Groceries</button>' +
      '<button class="tile-b" data-act="go" data-to="shop" data-cat="water"><i>💧</i>Water</button>' +
      '<button class="tile-b" data-act="go" data-to="shop" data-cat="news"><i>🗞️</i>News</button>' +
      '<button class="tile-b" data-act="go" data-to="services" data-cat="cleaning"><i>🧹</i>Cleaning</button>' +
      '<button class="tile-b" data-act="go" data-to="services" data-cat="vehicle"><i>🚗</i>Vehicle</button>' +
      '<button class="tile-b" data-act="go" data-to="services" data-cat="repair"><i>🔧</i>Repairs</button></div>';
    if (orders.length) h += '<div class="panel"><h3>Your usual</h3><p class="muted" style="margin:0 0 .7rem;font-size:.9rem">Re-order your last order in one tap.</p><button class="btn btn-primary btn-block" data-act="reorder" data-i="0">Re-order last order</button></div>';
    h += '<div class="panel"><h3>Need help?</h3><button class="btn btn-primary btn-block" data-act="go" data-to="help">Message our team</button></div>';
    return h;
  }

  /* Milk subscription offer: monthly plan comes with a free lactometer testing kit. */
  function milkLines() { return cart.filter(function (l) { var it = byId(l.id); return it && it.cat === 'milk'; }); }
  function milkOffer(inCart) {
    var ml = milkLines();
    if (inCart) {
      if (!ml.length) return '';
      if (ml.every(function (l) { return l.plan === 'Monthly'; }))
        return '<div class="offer ok"><i>✅</i><div><b>Monthly milk subscription</b><br>A free lactometer testing kit will come with your first delivery, so you can check your milk at home.</div></div>';
      return '<div class="offer"><i>🧪</i><div><b>Subscribe monthly and get a free lactometer testing kit</b><br>Test your milk\'s quality at home. Pause, skip or cancel any time.<br><button class="btn btn-primary" style="margin-top:.6rem" data-act="milkmonthly">Make my milk Monthly</button></div></div>';
    }
    return '<div class="offer"><i>🧪</i><div><b>Subscribe to our milk monthly and get a free lactometer testing kit</b><br>Add your milk, then choose Monthly in the cart.</div></div>';
  }
  function cartTotals() {
    var total = 0, unpriced = 0;
    cart.forEach(function (l) { var it = byId(l.id); if (!it) return; if (it.price == null) unpriced++; else total += it.price * l.qty; });
    return { total: total, unpriced: unpriced };
  }
  function cartScreen() {
    if (!cart.length) return '<div class="empty"><i>🧺</i><b>Your cart is empty</b><p>Add milk, groceries or a service to get started.</p><button class="btn btn-primary" data-act="go" data-to="shop">Start shopping</button></div>';
    var hasGoods = cart.some(function (l) { return byId(l.id).kind === 'goods'; });
    var hasSvc = cart.some(function (l) { return byId(l.id).kind === 'service'; });
    var gsC = gameStats();
    var h = '<h2 class="s">Your cart</h2><div class="cd" data-cd></div>';
    h += cart.map(function (l) {
      var it = byId(l.id), sub = '';
      var qtyTxt = it.qtyLabel ? l.qty + ' ' + it.qtyLabel : '';
      if (it.sub) sub += '<select data-act="plan" data-id="' + l.id + '" aria-label="Delivery plan">' + PLANS.map(function (p) { return '<option' + (l.plan === p ? ' selected' : '') + '>' + p + '</option>'; }).join('') + '</select>';
      if (it.price == null) sub += '<input data-act="note" data-id="' + l.id + '" placeholder="' + (it.cat === 'news' ? 'Which newspaper?' : 'Brand, size, quantity…') + '" value="' + esc(l.note) + '">';
      return '<div class="line"><div class="top"><div class="ico">' + icoHTML(it) + '</div><div class="meta"><b>' + esc(it.name) + '</b><small>' + esc(it.variant || '') + (qtyTxt ? ' · ' + qtyTxt : '') + '</small></div><div data-ctl="' + l.id + '">' + ctl(l.id) + '</div></div>' +
        '<div style="display:flex;justify-content:space-between;margin-top:6px;font-weight:700;font-size:.9rem"><span class="muted" style="font-weight:600">' + (it.price != null ? inr(it.price) + (it.unit ? ' ' + esc(it.unit) : '') : 'Price to be confirmed') + '</span><span>' + (it.price != null ? inr(it.price * l.qty) : '—') + '</span></div>' +
        (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>';
    }).join('');
    h += milkOffer(true);
    h += '<div class="goal">🐄 When this order is delivered, <b>' + esc(gsC.nextName) + '</b> joins your herd' + (gsC.next ? ' and you get closer to <b>' + esc(gsC.next.name) + '</b>' : '') + '.</div>';
    var t = cartTotals();
    h += '<div class="totals"><div class="r"><span>Total (priced items)</span><span id="tot">' + inr(t.total) + '</span></div><small>' + (t.unpriced ? t.unpriced + ' item(s) will be priced by our team. ' : '') + 'Subscription lines show the price per delivery. Service booking fees are adjusted in your final bill.</small></div>';
    h += '<div class="panel"><h3>Delivery details</h3>' + 
      '<div class="field"><label for="f-name">Name *</label><input id="f-name" value="' + esc(profile.name) + '" autocomplete="name"></div>' +
      '<div class="field"><label for="f-phone">Phone *</label><input id="f-phone" type="tel" inputmode="tel" value="' + esc(profile.phone) + '" autocomplete="tel"></div>' +
      '<div class="field"><label for="f-area">Area *</label><select id="f-area"><option value="">Select area</option>' + C.areas.map(function (a) { return '<option' + (profile.area === a ? ' selected' : '') + '>' + esc(a) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="f-addr">Full address *</label><textarea id="f-addr" rows="2" autocomplete="street-address">' + esc(profile.address) + '</textarea></div>' +
      (hasGoods ? '<div class="field"><label for="f-slot">Delivery slot</label><select id="f-slot"><option>Morning ' + esc(C.slot) + '</option><option>Evening 5–7pm</option></select></div>' : '') +
      (hasSvc ? '<div class="field"><label for="f-when">Preferred date & time for service</label><input id="f-when" placeholder="e.g. Saturday 11am"></div>' : '') +
      '<div class="field"><label for="f-pay">Payment</label><select id="f-pay"><option>UPI</option><option>Cash on delivery</option></select></div>' +
      '<div class="field"><label for="f-notes">Notes (optional)</label><input id="f-notes" placeholder="Gate code, landmark…"></div>' +
      '</div>';
    h += '<button class="btn btn-primary btn-block" data-act="checkout">Place order</button><p class="muted" style="font-size:.8rem;text-align:center;margin-top:.6rem">Your order goes to our team from inside the app. Follow it under Me.</p>';
    return h;
  }

  function meScreen() {
    var h = installBlock(), gm = gameStats();
    if (view.just) h += '<div class="panel win"><h3>🎉 Order ' + esc(view.just.id) + ' placed!</h3><p style="margin:0;font-size:.92rem">We will confirm it, pack it and deliver it. Once it is delivered, <b>' + esc(view.just.name) + '</b> ' + animal(0) + ' joins your herd.</p></div>';
    h += '<h2 class="s">Herd Club</h2><div class="panel">' + levelCard(gm) + '</div>' +
      '<div class="panel"><h3>Your herd</h3>' + herdGrid(gm) + '</div>' +
      '<div class="panel"><h3>Badges <span class="muted" style="font-weight:600;font-size:.82rem">' + gm.badges.filter(function (x) { return x.on; }).length + ' of ' + gm.badges.length + '</span></h3>' + badgeGrid(gm) + '<p class="muted" style="margin:.7rem 0 0;font-size:.78rem">Progress counts your delivered orders and is saved on this device.</p></div>';
    h += '<h2 class="s">Your details</h2><div class="panel">' +
      '<div class="field"><label for="p-name">Name</label><input id="p-name" value="' + esc(profile.name) + '"></div>' +
      '<div class="field"><label for="p-phone">Phone</label><input id="p-phone" type="tel" value="' + esc(profile.phone) + '"></div>' +
      '<div class="field"><label for="p-area">Area</label><select id="p-area"><option value="">Select area</option>' + C.areas.map(function (a) { return '<option' + (profile.area === a ? ' selected' : '') + '>' + esc(a) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="p-addr">Address</label><textarea id="p-addr" rows="2">' + esc(profile.address) + '</textarea></div>' +
      '<button class="btn btn-primary btn-block" data-act="saveprofile">Save details</button></div>';
    h += '<h2 class="s">Your orders</h2>';
    if (!orders.length) h += '<p class="muted">No orders yet.</p>';
    orders.slice(0, 15).forEach(function (o, i) {
      h += '<div class="order"><div class="h"><span>' + esc(o.id ? '#' + o.id : '') + ' ' + esc(new Date(o.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })) + '</span><span>' + (o.total ? inr(o.total) : '—') + '</span></div>' +
        '<span class="pill ' + (o.sent ? 'ok' : '') + '">' + esc(o.status || (o.sent ? 'Sent to our team' : 'Saved on this device')) + '</span>' + tracker(o) + '<ul>' +
        o.lines.map(function (l) { return '<li>' + esc(l.text) + '</li>'; }).join('') + '</ul><button class="btn btn-ghost" data-act="reorder" data-i="' + i + '">Re-order</button></div>';
    });
    h += '<div class="panel links"><a href="#help">💬 Message our team</a><a href="legal.html#privacy">Privacy Policy</a><a href="legal.html#terms">Terms</a><a href="#" data-act="clear">Clear data on this device</a></div>';
    return h;
  }

  /* Pull order status and team replies from the backend (needs formEndpoint). */
  function sync() {
    if (!C.formEndpoint || !profile.phone) return;
    var ids = orders.filter(function (o) { return o.sent; }).map(function (o) { return o.id; });
    api({ type: 'track', phone: profile.phone, ids: ids }).then(function (r) {
      if (!r || !r.ok) return;
      var changed = false;
      orders.forEach(function (o) { var st = r.orders && r.orders[o.id]; if (st && o.status !== st) { o.status = st; changed = true; } });
      (r.replies || []).forEach(function (m) {
        if (!messages.some(function (x) { return x.team && Number(x.at) === Number(m.at); })) { messages.push({ at: m.at, text: m.text, team: true, sent: true }); changed = true; }
      });
      if (changed) { store.set('vl_orders', orders); checkRewards(); store.set('vl_msgs', messages.slice(-50)); if (current() === 'me' || current() === 'help') { var keep = screen.scrollTop; var ta = document.getElementById('msg'), draft = ta ? ta.value : ''; render(); screen.scrollTop = keep; var t2 = document.getElementById('msg'); if (t2 && draft) t2.value = draft; } }
    });
  }

  function helpScreen() {
    var h = '<h2 class="s">Message our team</h2><p class="muted" style="margin-top:-.4rem;font-size:.9rem">Ask about an order, a price or a service. Replies from our team appear here.</p>';
    var list = messages.slice().sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
    h += '<div class="thread">' + (list.length ? list.map(function (m) {
      return '<div class="bubble' + (m.team ? ' team' : '') + '"><p>' + esc(m.text) + '</p><small>' + esc(new Date(m.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })) + ' · ' + (m.team ? 'Our team' : (m.sent ? 'Sent' : 'Saved on this device')) + '</small></div>';
    }).join('') : '<div class="empty"><i>💬</i>No messages yet. Write to us below.</div>') + '</div>';
    h += '<div class="panel">' + (profile.phone ? '' : '<div class="field"><label for="msg-phone">Your phone number *</label><input id="msg-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="10-digit mobile number"></div>') +
      '<div class="field"><label for="msg">Your message</label><textarea id="msg" rows="3" placeholder="Type your message"></textarea></div><button class="btn btn-primary btn-block" data-act="sendmsg">Send message</button></div>';
    return h;
  }

  /* ---------- routing / render ---------- */
  function current() { var h = (location.hash || '#home').slice(1); return ['home', 'shop', 'services', 'cart', 'me', 'help'].indexOf(h) > -1 ? h : 'home'; }
  function render() {
    var t = current();
    document.querySelectorAll('.tabs a').forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-tab') === t); });
    if (t !== 'me') view.just = null;
    var scroll = screen.scrollTop;
    screen.innerHTML = t === 'home' ? homeScreen() : t === 'shop' ? catalogScreen('goods') : t === 'services' ? catalogScreen('service') : t === 'cart' ? cartScreen() : t === 'help' ? helpScreen() : meScreen();
    screen.scrollTop = t === current() && render._last === t ? scroll : 0;
    render._last = t;
    badge(); updateCountdowns(); checkRewards();
    clearInterval(tickTimer);
    var tk = document.getElementById('tk');
    if (tk) {
      var names = herd.slice().sort(function () { return Math.random() - .5; });
      var step = function () { var a = names[tickIdx % names.length], b = names[(tickIdx + 1) % names.length], c = names[(tickIdx + 2) % names.length]; tk.style.opacity = 0; setTimeout(function () { tk.textContent = a + ', ' + b + ' and ' + c; tk.style.opacity = 1; }, 250); tickIdx += 3; };
      step(); tickTimer = setInterval(step, 3500);
    }
  }
  window.addEventListener('hashchange', function () { render(); if (current() === 'me' || current() === 'help') sync(); });

  function lineText(l) {
    var it = byId(l.id), parts = [it.name + (it.variant && it.kind === 'goods' && it.price != null ? ' ' + it.variant : '')];
    var s = parts[0] + ' × ' + l.qty + (it.qtyLabel ? ' ' + it.qtyLabel : '');
    if (it.sub && l.plan !== 'Once') s += ' — ' + l.plan;
    if (l.note) s += ' (' + l.note + ')';
    if (it.price != null) s += ' — ' + inr(it.price * l.qty);
    return s;
  }

  function checkout() {
    var v = function (id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; };
    var name = v('f-name'), phone = v('f-phone').replace(/\D/g, '').slice(-10), area = v('f-area'), addr = v('f-addr');
    if (!name) return toast('Please enter your name');
    if (phone.length !== 10) return toast('Enter a valid 10-digit phone');
    if (!area) return toast('Please choose your area');
    if (!addr) return toast('Please enter your address');
    profile = { name: name, phone: phone, area: area, address: addr }; store.set('vl_profile', profile);
    var t = cartTotals(), lines = cart.map(function (l) { return { text: lineText(l), id: l.id, qty: l.qty, plan: l.plan, note: l.note }; });
    if (milkLines().length && milkLines().every(function (l) { return l.plan === 'Monthly'; })) lines.push({ text: 'FREE lactometer testing kit (monthly milk subscription, first delivery)', id: 'kit-lactometer', qty: 1 });
    var order = { id: 'VL' + Date.now().toString(36).toUpperCase().slice(-6), at: new Date().toISOString(), total: t.total, unpriced: t.unpriced, lines: lines,
      customer: { name: name, phone: phone, area: area, address: addr }, payment: v('f-pay'), slot: v('f-slot'), when: v('f-when'), notes: v('f-notes') };
    order.sent = sendToTeam('order', order);
    finishOrder(order);
  }
  function finishOrder(order) {
    orders.unshift(order); orders = orders.slice(0, 30); store.set('vl_orders', orders);
    var pendingBefore = orders.filter(function (x) { return x !== order && x.status !== 'Cancelled' && x.status !== 'Delivered'; }).length;
    view.just = { id: '#' + order.id, name: herdOrder[(orders.filter(function (x) { return x.status === 'Delivered'; }).length + pendingBefore) % herdOrder.length] };
    cart = []; saveCart(); confetti();
    toast(order.sent ? 'Order ' + order.id + ' placed' : 'Order ' + order.id + ' saved on this device');
    location.hash = '#me';
  }

  /* ---------- events ---------- */
  screen.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]'); if (!el) return;
    var act = el.getAttribute('data-act'), id = el.getAttribute('data-id');
    if (act === 'inc' || act === 'dec') {
      change(id, act === 'inc' ? 1 : -1);
      if (current() === 'cart') { var keep = screen.scrollTop; render(); screen.scrollTop = keep; }
      else document.querySelectorAll('[data-ctl="' + id + '"]').forEach(function (c) { c.innerHTML = ctl(id); });
    } else if (act === 'cat') { view[el.getAttribute('data-key')] = el.getAttribute('data-k'); render(); }
    else if (act === 'go') { var to = el.getAttribute('data-to'), cat = el.getAttribute('data-cat'); if (cat) view[to === 'shop' ? 'shopCat' : 'svcCat'] = cat; location.hash = '#' + to; if (current() === to) render(); }
    else if (act === 'checkout') checkout();
    else if (act === 'milkmonthly') { milkLines().forEach(function (l) { l.plan = 'Monthly'; }); saveCart(); var k2 = screen.scrollTop; render(); screen.scrollTop = k2; toast('Monthly plan set. Free lactometer kit included'); }
    else if (act === 'sendmsg') {
      var ta = document.getElementById('msg'), text = ta ? ta.value.trim() : '';
      if (!text) return toast('Type a message first');
      var mp = document.getElementById('msg-phone');
      if (mp) { var pn = mp.value.replace(/\D/g, '').slice(-10); if (pn.length !== 10) return toast('Enter a valid 10-digit phone'); profile.phone = pn; store.set('vl_profile', profile); }
      var m = { at: new Date().toISOString(), text: text };
      m.sent = sendToTeam('message', { text: text, at: m.at, customer: profile });
      messages.push(m); store.set('vl_msgs', messages.slice(-50)); render(); toast(m.sent ? 'Message sent' : 'Message saved on this device');
    }
    else if (act === 'install') { if (deferred) { deferred.prompt(); deferred = null; render(); } }
    else if (act === 'saveprofile') {
      profile = { name: document.getElementById('p-name').value.trim(), phone: document.getElementById('p-phone').value.replace(/\D/g, '').slice(-10), area: document.getElementById('p-area').value, address: document.getElementById('p-addr').value.trim() };
      store.set('vl_profile', profile); toast('Details saved');
    } else if (act === 'reorder') {
      var o = orders[Number(el.getAttribute('data-i'))]; if (!o) return;
      o.lines.forEach(function (l) { if (!byId(l.id)) return; var ex = null; cart.forEach(function (c) { if (c.id === l.id) ex = c; }); if (ex) ex.qty += l.qty; else cart.push({ id: l.id, qty: l.qty, plan: l.plan || 'Once', note: l.note || '' }); });
      saveCart(); toast('Added to cart'); location.hash = '#cart';
    } else if (act === 'clear') { e.preventDefault(); if (confirm('Clear cart, orders and saved details on this device?')) { cart = []; orders = []; profile = {}; messages = []; ['vl_cart', 'vl_orders', 'vl_profile', 'vl_msgs'].forEach(function (k) { try { localStorage.removeItem(k); } catch (x) {} }); render(); toast('Cleared'); } }
  });
  screen.addEventListener('change', function (e) {
    var el = e.target, act = el.getAttribute('data-act'), id = el.getAttribute('data-id');
    if (act === 'plan') { var isMilk = false; cart.forEach(function (l) { if (l.id === id) { l.plan = el.value; var it0 = byId(l.id); if (it0 && it0.cat === 'milk') isMilk = true; } }); store.set('vl_cart', cart); if (isMilk) { var k3 = screen.scrollTop; render(); screen.scrollTop = k3; } }
  });
  screen.addEventListener('input', function (e) {
    var el = e.target;
    if (el.id === 'q') { view.q = el.value; var kind = current() === 'shop' ? 'goods' : 'service', key = kind === 'goods' ? 'shopCat' : 'svcCat', q = view.q.trim().toLowerCase();
      var list = catalog.filter(function (i) { return i.kind === kind && (view[key] === 'all' || i.cat === view[key]) && (!q || (i.name + ' ' + i.variant).toLowerCase().indexOf(q) > -1); });
      document.getElementById('list').innerHTML = list.length ? list.map(itemHTML).join('') : '<div class="empty"><i>🔍</i>Nothing found. Message our team and we will help.</div>'; }
    else if (el.getAttribute('data-act') === 'note') { var id = el.getAttribute('data-id'); cart.forEach(function (l) { if (l.id === id) l.note = el.value; }); store.set('vl_cart', cart); }
  });

  /* ---------- boot ---------- */
  if (!location.hash) location.hash = '#home';
  render();
  sync(); setInterval(sync, 45000); setInterval(updateCountdowns, 30000);
  var cb = document.getElementById('cartbar'); if (cb) cb.addEventListener('click', function () { location.hash = '#cart'; });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(function () {});
})();
