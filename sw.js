/* ==========================================================================
   OMA · service worker
   Кэшируем оболочку приложения, чтобы сайт открывался офлайн и его можно было
   установить как веб-приложение (Chrome требует манифест + sw с fetch-хендлером).
   Стратегия: навигация — сеть с фолбэком на кэш, статика — кэш + обновление.
   ========================================================================== */

var CACHE = 'oma-shell-v1';

var SHELL = [
    './',
    './index.html',
    './client.html',
    './master.html',
    './masters.html',
    './product.html',
    './manifest.webmanifest',
    './css/styles.css',
    './css/cabinet.css',
    './js/data.js',
    './js/store.js',
    './js/ui.js',
    './js/app.js',
    './js/client.js',
    './js/master.js',
    './img/logo.png',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-512.png',
    './icons/apple-touch-icon.png',
    './icons/favicon-32.png'
];

self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE)
            .then(function (cache) { return cache.addAll(SHELL); })
            .then(function () { return self.skipWaiting(); })
    );
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys()
            .then(function (keys) {
                return Promise.all(keys.filter(function (key) {
                    return key !== CACHE;
                }).map(function (key) {
                    return caches.delete(key);
                }));
            })
            .then(function () { return self.clients.claim(); })
    );
});

self.addEventListener('fetch', function (event) {
    var request = event.request;
    if (request.method !== 'GET') return;

    var url;
    try {
        url = new URL(request.url);
    } catch (error) {
        return;
    }
    /* внешние ресурсы (шрифты, картинки товаров) — только из сети */
    if (url.origin !== self.location.origin) return;

    /* переходы между страницами: сеть, при ошибке — кэш */
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then(function (response) {
                    var copy = response.clone();
                    caches.open(CACHE).then(function (cache) {
                        cache.put(new Request(url.pathname), copy).catch(function () { });
                    });
                    return response;
                })
                .catch(function () {
                    return caches.match(request, { ignoreSearch: true })
                        .then(function (cached) {
                            return cached || caches.match('./index.html');
                        });
                })
        );
        return;
    }

    /* статика: сначала кэш, затем сеть с обновлением кэша */
    event.respondWith(
        caches.match(request).then(function (cached) {
            var network = fetch(request)
                .then(function (response) {
                    if (response && response.ok) {
                        var copy = response.clone();
                        caches.open(CACHE).then(function (cache) {
                            cache.put(request, copy).catch(function () { });
                        });
                    }
                    return response;
                })
                .catch(function () { return cached; });
            return cached || network;
        })
    );
});
