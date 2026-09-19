/* Service worker - makes the app usable with no network at all, which is the
   point of a tool you might open in a council chamber on a bad connection.

   Two things here are deliberate and were learned the hard way:

   1. Nothing is pre-cached in a burst. cache.addAll() fires every request at
      once, and a local Python server answering a browser that is already
      loading the app will reset some of those connections. The shell is warmed
      one file at a time, and the data files are cached as the app asks for
      them.

   2. The offline fallback applies to navigations only. Falling back to
      index.html for any failed request hands HTML to code expecting JSON,
      which surfaces as "Unexpected token '<'" and is far more confusing than
      the original network error.

   3. Requests go to the network FIRST and fall back to the cache, rather than
      the other way round. Cache-first is the usual advice and it is wrong
      here: it means a rebuilt app or a refreshed dataset stays invisible until
      someone remembers to bump a version string, which is a trap that costs an
      afternoon every time. On localhost the network is instant, and offline
      the fetch fails immediately and the cache answers.

   4. This worker SHARES AN ORIGIN with other apps. Published to GitHub Pages
      it lives at robertwalterj.github.io/hinterland/, alongside Landfall,
      Halyard, Commonplace and Wordhoard - and CacheStorage belongs to the
      origin, not the path. So it touches only caches whose names carry its
      own prefix, and it never calls the global caches.match(), which would
      search every app's cache. The first version of this file deleted every
      cache that was not its own on activation: deployed as it was, the first
      visit would have wiped the other apps' offline copies.

   Bump VERSION to evict an old cache wholesale. */

var PREFIX = 'hinterland-';
var VERSION = PREFIX + 'v14';
/* Caches this app created under its old working name, on origins it has
   always had to itself (the local launcher). Safe to clear; nobody else's. */
var LEGACY = 'gra-';

function ours(name) {
  return name.indexOf(PREFIX) === 0 || name.indexOf(LEGACY) === 0;
}

function fromOurCache(req) {
  return caches.open(VERSION).then(function (c) { return c.match(req); });
}

/* The shell: small, and all of it needed before anything can render. */
var SHELL = [
  'index.html',
  'css/app.css',
  'js/methods.js', 'js/data.js', 'js/charts.js', 'js/map.js',
  'js/export.js', 'js/sound.js', 'js/read.js', 'js/terms.js', 'js/history.js',
  'js/findings.js',
  'js/spatial.js',
  'js/ttwa.js', 'js/brief.js', 'js/exportui.js', 'js/panels.js',
  'js/panel-population.js', 'js/panel-region.js', 'js/panel-impact.js', 'js/panel-change.js', 'js/panel-known.js',
  'js/learn.js', 'js/home.js', 'js/quiz-bank.js', 'js/quiz-ideas.js', 'js/quiz-sched.js', 'js/quiz-ui.js',
  'js/app.js',
  'manifest.webmanifest'
];

function warmSequentially(cache, urls, i) {
  i = i || 0;
  if (i >= urls.length) return Promise.resolve();
  return fetch(urls[i], { cache: 'reload' })
    .then(function (r) { if (r && r.ok) return cache.put(urls[i], r); })
    .catch(function () { /* one missing file must not fail the install */ })
    .then(function () { return warmSequentially(cache, urls, i + 1); });
}

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION)
      .then(function (c) { return warmSequentially(c, SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      /* Only our own superseded caches. Anything else on this origin belongs
         to another app and is not ours to delete. */
      return Promise.all(keys.filter(function (k) {
        return ours(k) && k !== VERSION;
      }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;

  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok && res.type === 'basic') {
        var copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function (err) {
      return fromOurCache(req).then(function (hit) {
        if (hit) return hit;
        /* Navigations get the shell so the app still opens offline. Everything
           else gets the real failure, so the app can retry or say so rather
           than being handed HTML where it expected JSON. */
        if (req.mode === 'navigate') return fromOurCache('index.html');
        throw err;
      });
    })
  );
});
