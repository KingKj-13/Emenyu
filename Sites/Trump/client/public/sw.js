const CACHE = 'emenyu-trump-v1';
const API_PATTERNS = ['/api/', '/Trump/api/', '/socket.io/'];

function isApiRequest(url) {
  return API_PATTERNS.some(p => url.includes(p));
}

self.addEventListener('install', e => {
  self.skipWaiting();
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

  // Network-first for API and socket
  if (isApiRequest(url)) {
    e.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // Cache-first for static assets (JS/CSS/images)
  if (/\.(js|css|png|jpg|jpeg|webp|svg|woff2?|ttf)(\?.*)?$/.test(url)) {
    e.respondWith(
      caches.match(request).then(cached => {
        const network = fetch(request).then(res => {
          if (res.ok) {
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
