const CACHE = 'emenyu-trump-v4';
const API_PATTERNS = ['/api/', '/Trump/api/', '/socket.io/'];

function isApiRequest(url) {
  return API_PATTERNS.some(p => url.includes(p));
}

function isServiceWorkerScript(url) {
  try {
    return new URL(url).pathname.toLowerCase().endsWith('/sw.js');
  } catch {
    return false;
  }
}

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = request.url;

  // Never serve the service-worker script from our runtime cache. Otherwise a
  // deployed update can require two manual refreshes before the new worker runs.
  if (isServiceWorkerScript(url)) {
    e.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  // Network-first for API and socket
  if (isApiRequest(url)) {
    e.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // Cache-first for static assets (JS/CSS/images/video).
  if (/\.(js|css|png|jpg|jpeg|webp|svg|woff2?|ttf|mp4|mov|m4v|webm)(\?.*)?$/.test(url)) {
    e.respondWith(
      caches.match(request).then(cached => {
        const network = fetch(request).then(res => {
          // Only cache complete 200 responses — caching a 206 partial (range
          // request, used for video) is invalid and breaks playback.
          if (res.ok && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(request, clone));
          }
          return res;
        });
        return cached || network;
      })
    );
    return;
  }

  // Network-first for HTML (SPA navigation)
  e.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

self.addEventListener('push', e => {
  let data = { title: 'Emenyu', body: 'New notification', url: '/Trump/Waiter' };
  if (e.data) {
    try { data = { ...data, ...JSON.parse(e.data.text()) }; } catch {}
  }
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/Trump/favicon.svg',
      badge: '/Trump/favicon.svg',
      tag: data.tag || 'emenyu',
      data: { url: data.url || '/Trump/Waiter' }
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/Trump/Waiter';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const match = list.find(c => c.url.includes('/Trump'));
      if (match) return match.focus();
      return clients.openWindow(url);
    })
  );
});
