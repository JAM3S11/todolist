// Where links the app sends out should point: the shared-list link, invitation
// emails, and the "back to the app" step after resetting a password.
//   - Running on your computer (localhost)  → this same localhost address, so local trials stay local
//   - Anywhere else (Vercel, previews)      → the live Vercel address
// Never the Firebase *.firebaseapp.com address.
export const PRODUCTION_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://todolist.vercel.app').replace(/\/+$/, '');

export const isLocalHost = (hostname) =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname.endsWith('.localhost');

export function appOrigin() {
  if (typeof window === 'undefined') return PRODUCTION_URL;
  return isLocalHost(window.location.hostname) ? window.location.origin : PRODUCTION_URL;
}

// appUrl('/?list=abc') → 'https://todolist.vercel.app/?list=abc' (or http://localhost:3000/?list=abc)
export const appUrl = (path = '/') => `${appOrigin()}${path.startsWith('/') ? path : `/${path}`}`;

// A link we may send someone to after an email action: only this app, live or local
export function isOurUrl(href) {
  try {
    const u = new URL(href);
    return u.origin === PRODUCTION_URL || u.origin === window.location.origin || isLocalHost(u.hostname);
  } catch {
    return false;
  }
}
