// Keeps the tracker working with no signal. The app files are served from the
// cache right away and refreshed in the background, so an update shows up on
// the next launch. Fonts are cached the first time they load.
var APP_CACHE = 'recomp-app-v1';
var FONT_CACHE = 'recomp-fonts-v1';
var APP_FILES = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(APP_CACHE).then(function (cache) { return cache.addAll(APP_FILES); }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== APP_CACHE && k !== FONT_CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function staleWhileRevalidate(cacheName, request, fallbackKey) {
  return caches.open(cacheName).then(function (cache) {
    return cache.match(request, { ignoreSearch: true }).then(function (hit) {
      var network = fetch(request).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) cache.put(fallbackKey || request, res.clone());
        return res;
      }).catch(function () { return hit; });
      if (hit) return hit;
      return network.then(function (res) {
        if (res) return res;
        return fallbackKey ? cache.match(fallbackKey) : undefined;
      });
    });
  });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') {
      event.respondWith(staleWhileRevalidate(APP_CACHE, req, './index.html'));
    } else {
      event.respondWith(staleWhileRevalidate(APP_CACHE, req));
    }
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(FONT_CACHE, req));
  }
});
