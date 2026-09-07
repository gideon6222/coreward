/* Deletes caches left behind by the hand-written service worker that shipped
   before the Vite migration.

   Workbox's cleanupOutdatedCaches only removes precaches it created itself
   (workbox-precache-v2-*). A cache named "coreward-v5" is invisible to it, so
   without this it would sit on the device forever: measured at 1.31 MB of
   orphaned data, including the old CDN copy of three.js.

   This runs on activate, not from the page. During the upgrade load the old
   worker is still serving the old index.html, which references ./app.js - a
   path the new build no longer emits. Deleting the cache from the page would
   send that fetch to the network, 404, and break the very load that is meant
   to hand over. By activate time the old worker is gone and nothing needs it.

   Matched by pattern rather than by name so earlier versions (v1..v4) are
   cleaned up too, on a device that skipped a few updates. */

const LEGACY_CACHE = /^coreward-v\d+$/;

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => LEGACY_CACHE.test(name))
          .map((name) => caches.delete(name))
      )
    )
  );
});
