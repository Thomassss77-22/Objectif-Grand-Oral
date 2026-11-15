// Cache hors ligne : réseau d'abord, cache en secours.
const CACHE = "ogo-v5";
const FILES = ["./", "index.html", "style.css", "app.js", "contenu.js", "srs.js", "manifest.json", "data/cours.json", "data/jury.json", "icons/logo-mark.png", "icons/favicon.png", "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "fonts/jakarta.woff2"];

// Un fichier absent (contenu réservé, livré par le coffre privé) ne doit pas empêcher l'installation.
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => Promise.all(FILES.map((f) => c.add(f).catch(() => {}))))));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))));
self.addEventListener("fetch", (e) => {
  // Seules les lectures de ce site passent par le cache : ni les envois, ni les appels au service de comptes.
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
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
