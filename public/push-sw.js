// Added to the app's service worker: shows lock-screen notifications sent by the
// HK Bus Time push server, and opens the app when one is tapped.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: event.data ? event.data.text() : '巴士提醒' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || '🔔 巴士提醒', {
      body: data.body || '',
      tag: data.tag || 'bus',
      renotify: true,
      vibrate: [200, 100, 200, 100, 300],
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      data: { url: './#/fav' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus();
      return self.clients.openWindow(event.notification.data?.url || './');
    }),
  );
});
