/* Service Worker: App offline verfügbar machen + Kartenkacheln zwischenspeichern.
   Jagddaten laufen NICHT hierüber – die liegen in IndexedDB auf dem Gerät. */
const SHELL = 'jagdbuch-shell-v5';
const TILES = 'tiles';
const FILES = ['./', 'index.html', 'app.js', 'styles.css', 'manifest.webmanifest',
  'leaflet.js', 'leaflet.css', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
const TILE_HOSTS = ['arcgisonline.com', 'tile.openstreetmap.org', 'tile.opentopomap.org'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('jagdbuch-shell-') && k !== SHELL).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (TILE_HOSTS.some(h => url.hostname.endsWith(h))){
    // Kacheln: erst Cache, sonst Netz und merken
    e.respondWith(caches.open(TILES).then(async c => {
      const hit = await c.match(req.url); if (hit) return hit;
      try { const r = await fetch(req); if (r.ok || r.type === 'opaque') c.put(req.url, r.clone()); return r; }
      catch(err){ return new Response('', { status: 504 }); }
    }));
    return;
  }
  if (url.origin === location.origin){
    // App-Dateien: Netz zuerst (Updates), offline aus dem Cache
    e.respondWith(fetch(req).then(r => { if (r.ok){ const cl = r.clone(); caches.open(SHELL).then(c => c.put(req, cl)); } return r; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
  }
});
