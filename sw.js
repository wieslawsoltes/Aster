'use strict';
const CACHE = 'aster-desktop-1.1.0-windows';
const FILES = ['./', './index.html', './manifest.webmanifest', './assets/icon.svg', './assets/icon-192.png', './assets/icon-512.png', './src/styles.css', './src/core.js', './src/renderer.js', './src/windows.js', './src/apps-files.js', './src/apps-creative.js', './src/apps-tools.js', './src/apps-system.js', './src/apps-windows.js', './src/shell.js'];
self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
    event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('aster-desktop-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
    const request = event.request;
    // Never cache companion API, credentials, downloads or one-time tickets.
    const allowed = new Set(FILES.map(path => new URL(path, self.registration.scope).href));
    if (request.method !== 'GET' || request.headers.has('Authorization') || !allowed.has(request.url))
        return;
    event.respondWith((async () => {
        try {
            const response = await fetch(request);
            if (response.ok) {
                // Await within respondWith: no late waitUntil call on an inactive event.
                try {
                    const cache = await caches.open(CACHE);
                    await cache.put(request, response.clone());
                }
                catch { }
            }
            return response;
        }
        catch {
            return await caches.match(request) || new Response('Aster is offline and this resource has not been cached.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
        }
    })());
});
