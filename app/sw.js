// Cache hors ligne : réseau d'abord, cache en secours.
const CACHE = "ogo-v2";
const FILES = ["./", "index.html", "style.css", "app.js", "srs.js", "manifest.json", "data/cours.json", "data/jury.json", "data/q500.json", "icons/logo-mark.png", "icons/favicon.png", "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "fonts/jakarta.woff2"];

self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))));
self.addEventListener("fetch", (e) => {
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return r;
      })
      .catch(() => caches.match(e.request))
  );
});
