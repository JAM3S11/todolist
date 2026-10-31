'use client';
// Notices when a newer version of the app has gone live while this one stays open
// (an installed app left in the background, a window that's never closed).
import { useEffect, useState } from 'react';

const RUNNING = process.env.NEXT_PUBLIC_BUILD_ID;
const EVERY_MS = 15 * 60 * 1000;
const NOTIFIED = 'updateNotified'; // the version we already sent a device notification about

async function liveVersion() {
  try {
    const res = await fetch('/api/version', { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()).id || null;
  } catch {
    return null; // offline: try again later
  }
}

// In the background: a device notification, once per version, if notifications are on here.
// Clicking it goes through push-sw.js's notificationclick, which opens the app on the new version.
async function notifyDevice(id) {
  try {
    if (sessionStorage.getItem(NOTIFIED) === id) return;
    sessionStorage.setItem(NOTIFIED, id);
  } catch {}
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted' || !('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration('/push-sw.js');
    await reg?.showNotification('Shared To-Do updated', {
      body: 'Tap to get the latest version.',
      tag: 'app-update',
      icon: '/icons/emblem-192.png',
      badge: '/icons/badge-72.png',
      data: { link: '/' },
    });
  } catch {}
}

export default function useUpdateCheck() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!RUNNING || ready) return;
    let stop = false;
    async function check() {
      const id = await liveVersion();
      if (stop || !id || id === RUNNING) return;
      setReady(true);
      if (document.visibilityState === 'hidden') notifyDevice(id);
    }
    const onShow = () => document.visibilityState === 'visible' && check();
    const timer = setInterval(check, EVERY_MS);
    document.addEventListener('visibilitychange', onShow);
    window.addEventListener('focus', check);
    return () => {
      stop = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onShow);
      window.removeEventListener('focus', check);
    };
  }, [ready]);

  return ready;
}
