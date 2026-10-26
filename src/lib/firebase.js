import { getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

// Each value must be written out in full so Next.js can bake it into the browser code.
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseConfigured = Boolean(
  config.apiKey && config.projectId && config.appId && !config.apiKey.startsWith('your-'),
);

export const inviteEmailsEnabled = process.env.NEXT_PUBLIC_INVITE_EMAILS === 'true';
const useEmulators = process.env.NEXT_PUBLIC_USE_EMULATORS === 'true';

let cached = null;

// Call this only in the browser (inside effects and event handlers).
export function fb() {
  if (!firebaseConfigured || typeof window === 'undefined') return null;
  if (cached) return cached;

  const app = getApps()[0] || initializeApp(config);
  const auth = getAuth(app);

  // The local cache keeps a copy of your lists in this browser, so the app opens
  // instantly on your last work and keeps working offline. Changes sync when you reconnect.
  let db;
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    db = getFirestore(app);
  }

  if (useEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }

  cached = { app, auth, db };
  return cached;
}

// Firebase error codes → plain sentences
export function friendlyError(err) {
  const code = err?.code || '';
  const map = {
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/wrong-password': 'Wrong email or password.',
    'auth/user-not-found': 'No account uses that email. Create one instead.',
    'auth/email-already-in-use': 'An account already uses that email. Sign in instead.',
    'auth/weak-password': 'Use a password with at least 6 characters.',
    'auth/invalid-email': "That email address isn't valid.",
    'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
    'auth/popup-closed-by-user': 'The Google window was closed before signing in.',
    'auth/network-request-failed': 'No connection. Check your internet and try again.',
    'auth/operation-not-allowed': 'This sign-in method is turned off in the Firebase console.',
    'auth/unauthorized-domain': 'This web address isn’t in Firebase → Authentication → Settings → Authorized domains.',
    'permission-denied': "You don't have permission to do that on this list.",
    unavailable: "You're offline. Your change is saved on this device and will sync when you reconnect.",
  };
  return map[code] || err?.message || 'Something went wrong.';
}
