// Server only: Firebase Admin for sending device notifications (/api/push, /api/push/test).
// Needs FIREBASE_SERVICE_ACCOUNT: the whole service-account JSON file, pasted as one value.
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

let setupError = null;

// { auth, db, messaging }, or { error } saying what's wrong with the server's settings
export function admin() {
  if (!getApps().length) {
    if (setupError) return { error: setupError };
    let raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
    if (!raw) return { error: 'Device notifications are not set up on the server (FIREBASE_SERVICE_ACCOUNT is empty).' };
    // pasted with quotes around it
    if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"') && !raw.startsWith('"{'))) raw = raw.slice(1, -1);
    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      setupError = 'FIREBASE_SERVICE_ACCOUNT on the server is not valid JSON. Paste the whole downloaded key file as its value.';
      return { error: setupError };
    }
    // the key's line breaks often arrive as the two characters "\n"
    if (typeof json.private_key === 'string') json.private_key = json.private_key.replace(/\\n/g, '\n');
    try {
      initializeApp({ credential: cert(json) });
    } catch (e) {
      setupError = `FIREBASE_SERVICE_ACCOUNT on the server isn't a usable service-account key (${e.code || e.message}).`;
      return { error: setupError };
    }
  }
  return { auth: getAuth(), db: getFirestore(), messaging: getMessaging() };
}

export const DEAD_TOKEN = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token', 'messaging/invalid-argument']);

// Who's calling, from "Authorization: Bearer <Firebase ID token>"; null if not signed in
export async function caller(a, req) {
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  try {
    return await a.auth.verifyIdToken(bearer);
  } catch {
    return null;
  }
}
