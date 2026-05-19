/* eslint-disable */
// imap-rest webmail service worker.
//
// Strategies:
//   * Static SPA shell (HTML, JS, CSS, icons) — cache-first with background revalidate.
//   * /v1/* API calls — network-first; on offline, fall back to a per-user
//     read-only cache so folder lists and recent messages still render.
//     Cache keys are scoped by the Bearer token's first 8 chars to keep
//     accounts isolated. POST/PUT/DELETE never touched.
//   * Push events — show a notification with title from data + click → focus or open.
//
// Cache name is bumped on every webmail build so old caches are evicted.

const VERSION = 'v6-2026-05-04-update-prompt';
const SHELL_CACHE = 'webmail-shell-' + VERSION;
const API_CACHE = 'webmail-api-' + VERSION;
// Endpoints whose GET responses are safe to cache for offline reads.
// Anything outside this list always passes through to the network.
const API_OFFLINE_ALLOW = [
    /^\/v1\/mailboxes(?:\?|$)/,
    /^\/v1\/mailboxes\/[^/]+\/messages(?:\?|$)/,
    /^\/v1\/mailboxes\/[^/]+\/messages\/\d+(?:\?|$)/,
    /^\/v1\/me\/calendars/,
    /^\/v1\/me\/profile/,
    /^\/v1\/me\/contacts/
];

// We don't pre-list every hashed asset; instead we cache on first use. This
// also makes the SW work in dev without changes.
const SHELL_PATHS = ['/webmail/', '/webmail/index.html', '/webmail/mobile/', '/webmail/mobile/index.html', '/webmail/manifest.webmanifest', '/webmail/manifest-mobile.webmanifest', '/webmail/icon.svg'];

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        try {
            const cache = await caches.open(SHELL_CACHE);
            await cache.addAll(SHELL_PATHS).catch(() => {});
        } catch { /* best effort */ }
        // Don't skipWaiting() here. The SPA prompts the user before
        // upgrading so an in-flight compose / draft / chat reply
        // doesn't get torn down. The page posts SKIP_WAITING when
        // the user clicks "Refresh now" on the update toast.
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        const keep = new Set([SHELL_CACHE, API_CACHE]);
        await Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)));
        self.clients.claim();
    })());
});

// SKIP_WAITING: foreground page asks the new SW to take over ahead
// of schedule. Triggered by the update prompt's "refresh now" button.
// After skipWaiting + claim, the browser fires controllerchange, the
// page reloads, and the user lands on the fresh build.
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// Build a cache key that's user-scoped — first 8 chars of the bearer token
// (or "anon" if no auth header) prefixed onto the URL — so account A can't
// read account B's cached folder list.
function userScopedKey(req) {
    const auth = req.headers.get('authorization') || '';
    const m = auth.match(/^Bearer\s+(\S+)/i);
    const tag = m ? `b-${m[1].slice(0, 8)}` : 'anon';
    return new Request(`${req.url}#user=${tag}`, { method: 'GET' });
}

function isCacheableApi(url) {
    if (!url.pathname.startsWith('/v1/')) return false;
    const path = url.pathname + url.search;
    return API_OFFLINE_ALLOW.some((rx) => rx.test(path));
}

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;
    if (url.pathname === '/health' || url.pathname === '/openapi.json') return;

    // API calls: network-first, with an opt-in offline cache for read-only
    // GETs. The cache key is bearer-scoped so accounts stay isolated.
    if (url.pathname.startsWith('/v1/')) {
        if (!isCacheableApi(url)) return; // pass through
        event.respondWith((async () => {
            const cache = await caches.open(API_CACHE);
            const key = userScopedKey(req);
            try {
                const res = await fetch(req);
                if (res.ok) cache.put(key, res.clone()).catch(() => {});
                return res;
            } catch {
                const cached = await cache.match(key);
                if (cached) {
                    // Tag the response so the client can show an "offline,
                    // showing cached data" banner without parsing the body.
                    const headers = new Headers(cached.headers);
                    headers.set('x-webmail-from-cache', '1');
                    return new Response(await cached.blob(), {
                        status: cached.status,
                        statusText: cached.statusText,
                        headers
                    });
                }
                return new Response(
                    JSON.stringify({ title: 'Offline', detail: 'No cached data for this request.' }),
                    { status: 503, statusText: 'Offline', headers: { 'content-type': 'application/problem+json' } }
                );
            }
        })());
        return;
    }
    if (!url.pathname.startsWith('/webmail/')) return;

    event.respondWith((async () => {
        const cache = await caches.open(SHELL_CACHE);
        const cached = await cache.match(req);
        // Stale-while-revalidate: return cache immediately if present, refresh in background.
        const networkPromise = fetch(req).then((res) => {
            if (res.ok && (res.type === 'basic' || res.type === 'default')) {
                cache.put(req, res.clone()).catch(() => {});
            }
            return res;
        }).catch(() => null);
        if (cached) {
            networkPromise.catch(() => {});
            return cached;
        }
        const network = await networkPromise;
        if (network) return network;
        // Both cache + network failed — for navigation, fall back to the shell HTML.
        if (req.mode === 'navigate') {
            const fallback = await cache.match('/webmail/index.html') || await cache.match('/webmail/');
            if (fallback) return fallback;
        }
        return new Response('offline', { status: 503, statusText: 'Offline' });
    })());
});

self.addEventListener('push', (event) => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'New mail' }; }
    const title = data.title || 'New mail';
    const options = {
        body: data.body || 'You have a new message',
        icon: '/webmail/icon.svg',
        badge: '/webmail/icon.svg',
        tag: data.tag || 'webmail-new',
        data: { url: data.url || '/webmail/' },
        renotify: true
    };
    event.waitUntil((async () => {
        // Tell every open Webmail tab so foreground sound + counts update
        // immediately. The OS-level chime is platform-controlled (we cannot
        // attach a sound to showNotification reliably on most browsers).
        try {
            const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
            for (const client of all) client.postMessage({ type: 'webmail-new-mail', payload: data });
        } catch { /* clients API can fail; non-fatal */ }
        // Set app icon badge on supported platforms (iOS 16.4+, Android).
        if (data.unreadCount && navigator.setAppBadge) {
            try { navigator.setAppBadge(data.unreadCount); } catch { /* non-fatal */ }
        }
        await self.registration.showNotification(title, options);
    })());
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || '/webmail/';
    event.waitUntil((async () => {
        const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        // First pass: a tab whose URL contains the target. Best case
        // — we focus the exact surface the notification is for.
        for (const client of all) {
            if (client.url.includes(url) && 'focus' in client) {
                if ('navigate' in client) { try { await client.navigate(url); } catch { /* */ } }
                return client.focus();
            }
        }
        // Second pass: ANY open Webmail tab in scope. iOS PWA notification
        // clicks otherwise spawn a fresh Safari tab even when the PWA is
        // already running, because the URL match was too strict (mobile
        // notification carrying /webmail/mobile/ wouldn't match a
        // /webmail/ desktop tab and vice-versa). We'd rather focus an
        // existing window of the wrong sub-surface than open a duplicate.
        for (const client of all) {
            if (client.url.includes('/webmail/') && 'focus' in client) {
                if ('navigate' in client) { try { await client.navigate(url); } catch { /* */ } }
                return client.focus();
            }
        }
        if (self.clients.openWindow) await self.clients.openWindow(url);
    })());
});
