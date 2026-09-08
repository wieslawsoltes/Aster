'use strict';
const CACHE = 'aster-desktop-1.8.0-shell-launch';
const FILES = ['./', './index.html', './manifest.webmanifest', './assets/icon.svg', './assets/icon-192.png', './assets/icon-512.png', './src/styles.css', './src/shell-design.css', './src/integrated-desktop.js', './src/shell-experience.js', './src/core.js', './src/desktop-models.js', './src/archives.js', './src/desktop-services.js', './src/apps-desktop.js', './src/apps-accessibility.js', './src/apps-recorder.js', './src/renderer.js', './src/windows.js', './src/file-operations.js', './src/explorer-operations.js', './src/file-workflows.css','./src/shell-command-models.js','./src/shell-launch.js','./src/shell-launch.css', './src/apps-files.js', './src/apps-creative.js', './src/apps-tools.js', './src/apps-system.js', './src/shell.js', './src/web-app-catalog.js', './src/apps-web.js', './src/apps-win32.js', './src/win32/gdi.js', './src/win32/gui-host.js', './src/win32/resources.js', './src/win32/registry.js', './src/win32/gui.js', './src/win32/bitmaps.js', './src/win32/third-party/winemine.exe', './src/win32/third-party/NOTICE.txt', './third-party/winemine/winemine-source.zip', './src/win32/pe.js', './src/win32/runtime.js', './src/win32/compat.js', './src/win32/third-party/7zr.exe', './src/win32/third-party/tcc.exe', './src/win32/third-party/tcc-files.json', './src/win32/worker.js', './src/win32/x86.wasm', './src/win32/examples/hello.exe', './src/win32/examples/pad.exe', './src/win32/examples/gdi.exe', './src/win32/examples/compute.exe'];
self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
    event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('aster-desktop-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
    const request = event.request;
    const allowed = new Set(FILES.map(path => new URL(path, self.registration.scope).href));
    if (request.headers.has('Authorization') || !allowed.has(request.url)) return;
    if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin)
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
