/*
 * Pivotroom service worker. Deliberately minimal: it never caches pages,
 * data or anything signed-in (so nobody ever sees stale prices, slots or
 * another session's content). Its only job: when a page can't load
 * because the device is offline, show the branded offline page instead
 * of the browser's error.
 */
const OFFLINE_CACHE = "pivotroom-offline-v2";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.add(OFFLINE_URL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== OFFLINE_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  // Only full page loads; everything else goes straight to the network.
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.open(OFFLINE_CACHE).then((cache) => cache.match(OFFLINE_URL)),
    ),
  );
});
