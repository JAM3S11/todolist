// Device notifications for Shared To-Do.
// /api/push sends each one through Firebase Cloud Messaging as data: { title, body, link, tag }.
// This shows it in the phone's notification bar / the Windows or Mac notification centre,
// and opens the app on that list when it's clicked.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let msg = {};
  try {
    const payload = event.data ? event.data.json() : {};
    msg = payload.data || payload;
  } catch {
    return;
  }
  if (!msg.title) return;

  event.waitUntil((async () => {
    // Someone looking at the app right now already sees it there (a pop-up in the app), so no double alert
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (open.some((c) => c.focused && c.visibilityState === 'visible')) return;
    await self.registration.showNotification(msg.title, {
      body: msg.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: msg.tag || undefined, // one per list, so a busy list doesn't pile up alerts
      renotify: !!msg.tag,
      data: { link: msg.link || '/' },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = new URL(event.notification.data?.link || '/', self.location.origin);
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // an open tab of the app: bring it forward and go to the list
    const tab = tabs.find((c) => new URL(c.url).origin === self.location.origin);
    if (tab) {
      await tab.focus();
      return tab.navigate(link.href).catch(() => {});
    }
    return self.clients.openWindow(link.href);
  })());
});
