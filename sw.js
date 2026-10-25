// Bump VERSION on every deploy so phones pick up the new files.
const VERSION = "gastos-v12";
const FILES = ["./", "index.html", "style.css", "app.js", "logic.js", "manifest.webmanifest",
  "icon-192.png", "icon-512.png", "apple-touch-icon.png",
  "fonts/bricolage.woff2", "fonts/figtree.woff2"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request)));
});
