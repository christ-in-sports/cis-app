// Minimal service worker: present for installability and future push
// notifications. It deliberately has no fetch handler, so every request goes
// straight to the network — no offline mode for MVP/v1.0 (see AGENTS.md §4),
// and authenticated pages and kid data are never cached.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Remove caches left by the earlier cache-first worker.
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});
