// Device notifications: turning them on and off for this browser / phone.
// Call these only in the browser. enablePush must run from a click (browsers only ask for
// permission in answer to something the person did).
import { deleteToken, getMessaging, getToken, isSupported } from 'firebase/messaging';
import { fb } from './firebase';
import { removePushToken, savePushToken } from './data';

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
const STORE = 'pushToken'; // this device's token, so we can refresh or remove it

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const installed = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const stored = () => { try { return localStorage.getItem(STORE); } catch { return null; } };
const remember = (t) => { try { t ? localStorage.setItem(STORE, t) : localStorage.removeItem(STORE); } catch {} };

// A short name for this device, shown nowhere yet but handy when looking at the data
function deviceName() {
  const ua = navigator.userAgent;
  const os = /Android/.test(ua) ? 'Android' : isIOS() ? 'iPhone/iPad' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${browser} on ${os}`;
}

// 'on' | 'off' | 'blocked' | 'unsupported' | 'ios-needs-home-screen' | 'not-set-up'
export async function pushState() {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
    return isIOS() && !installed() ? 'ios-needs-home-screen' : 'unsupported';
  }
  if (!(await isSupported().catch(() => false))) return isIOS() && !installed() ? 'ios-needs-home-screen' : 'unsupported';
  if (!VAPID_KEY) return 'not-set-up';
  if (Notification.permission === 'denied') return 'blocked';
  return Notification.permission === 'granted' && stored() ? 'on' : 'off';
}

async function token() {
  const reg = await navigator.serviceWorker.register('/push-sw.js', { updateViaCache: 'none' });
  await navigator.serviceWorker.ready;
  return getToken(getMessaging(fb().app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
}

// What went wrong while turning them on, in words (shown in the toast)
function why(step, e) {
  const code = e?.code || '';
  if (code.includes('permission-blocked') || code.includes('permission-default')) return 'Notifications are blocked for this site in the browser settings.';
  if (code.includes('failed-service-worker-registration')) return "The browser wouldn't start the app's notification helper. Reload the page and try again.";
  if (code.includes('token-subscribe-failed') || code.includes('token-unsubscribe-failed')) return 'Firebase refused this device (check the VAPID key and that the Firebase Cloud Messaging API is enabled).';
  if (code === 'permission-denied') return "Couldn't save this device to your account (Firestore rules).";
  return `Couldn't ${step}${code ? ` (${code})` : ''}. Try again, or try another browser.`;
}

// Ask, then save this device's token. Returns the new state; throws an Error saying why it failed.
export async function enablePush(user) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';
  let t;
  try { t = await token(); } catch (e) { throw new Error(why('get a notification address for this device', e)); }
  if (!t) throw new Error(why('get a notification address for this device'));
  const old = stored();
  if (old && old !== t) await removePushToken(old).catch(() => {});
  try { await savePushToken(user, t, deviceName()); } catch (e) { throw new Error(why('save this device', e)); }
  remember(t);
  return 'on';
}

// "Send a test notification": to every device turned on for my account. Returns how many got it.
export async function sendTestPush(user) {
  const res = await fetch('/api/push/test', { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error(body.error || `The server couldn't send it (${res.status}).`);
  return body.sent;
}

export async function disablePush() {
  const t = stored();
  if (!t) return 'off'; // never turned on here
  remember(null);
  await removePushToken(t).catch(() => {});
  try { await deleteToken(getMessaging(fb().app)); } catch {}
  return 'off';
}

// Tokens change now and then; when the app opens with notifications on, make sure the saved one is current
export async function refreshPush(user) {
  if ((await pushState()) !== 'on') return;
  const t = await token().catch(() => null);
  if (!t) return;
  const old = stored();
  if (old && old !== t) await removePushToken(old).catch(() => {});
  await savePushToken(user, t, deviceName()).catch(() => {});
  remember(t);
}
