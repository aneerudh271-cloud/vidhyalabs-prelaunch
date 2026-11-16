/* Network-first service worker: always fresh when online, works offline from cache. */
var V = 'vl-v2';
var ASSETS = ['./', 'index.html', 'app.html', 'app.js', 'data.js', 'styles.css', 'legal.html', 'manifest.webmanifest',
  'images/logo-lockup.png', 'images/milk-bottles.jpg', 'images/cleaning.jpg', 'images/carwash.jpg', 'images/repairs.jpg', 'images/bottle-boiled-500.jpg', 'images/bottle-boiled-1l.jpg', 'images/bottle-nonboiled-500.jpg', 'images/bottle-nonboiled-1l.jpg', 'images/svc-electrician.jpg', 'images/svc-plumbing.jpg', 'images/svc-appliance.jpg',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(V).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== V; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then(function (res) {
      var copy = res.clone();
      caches.open(V).then(function (c) { c.put(req, copy); });
      return res;
    }).catch(function () {
      return caches.match(req).then(function (m) { return m || caches.match('app.html'); });
    })
  );
});
