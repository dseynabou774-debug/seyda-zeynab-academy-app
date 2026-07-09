// =============================================================================
// service-worker.js — Cache-first pour un fonctionnement 100% hors ligne
// après le premier chargement. Incrémentez CACHE_NAME à chaque mise à jour
// de contenu (nouveaux audios, nouveaux niveaux...) pour forcer le
// rafraîchissement du cache sur les téléphones déjà installés.
// =============================================================================

const CACHE_NAME = "sza-cache-v28";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./styles.css",
  "./i18n.js",
  "./sessions.js",
  "./quran.js",
  "./db.js",
  "./diploma.js",
  "./billing.js",
  "./receipt.js",
  "./discover.js",
  "./app.js",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-512-maskable.png",
  "./apple-touch-icon.png",
  "./logo-header.png",
  "./logo-official.png",
  "./signature-teacher.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Stratégie : cache-first pour les fichiers de l'app et les polices/scripts CDN,
// avec repli réseau puis mise en cache pour les audios (téléchargés au fil de
// l'utilisation, ex. assets/audio/lettres/*.mp3), afin que tout nouvel audio
// ajouté par l'enseignante soit disponible hors ligne dès la première écoute.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
