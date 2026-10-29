// Sends device notifications (phone notification bar, Windows / Mac notification centre).
// The app calls this right after saving a change that wrote notifications (activity/{id}, invites/{id}).
// It only pushes notifications the caller just created themselves, each one once, to the devices of
// the person it's for. Needs FIREBASE_SERVICE_ACCOUNT (the service-account JSON) set on the server.
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { pushMessage } from '@/lib/activityText';

export const runtime = 'nodejs';

const MAX_IDS = 50;
const FRESH_MS = 2 * 60 * 1000; // only notifications made in the last 2 minutes
const DEAD_TOKEN = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token', 'messaging/invalid-argument']);

function admin() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) return null;
    initializeApp({ credential: cert(JSON.parse(raw)) });
  }
  return { auth: getAuth(), db: getFirestore(), messaging: getMessaging() };
}

const ids = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x && x.length < 1500) : []);

export async function POST(req) {
  const a = admin();
  if (!a) return Response.json({ error: 'Device notifications are not set up on the server.' }, { status: 503 });

  // who's asking
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  let caller;
  try {
    caller = await a.auth.verifyIdToken(bearer);
  } catch {
    return Response.json({ error: 'Sign in first.' }, { status: 401 });
  }
  const myEmail = (caller.email || '').toLowerCase();
  if (!myEmail) return Response.json({ error: 'Sign in with an email address.' }, { status: 401 });

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Bad request.' }, { status: 400 });
  }
  const wanted = [
    ...ids(body.activity).map((id) => ['activity', id]),
    ...ids(body.invites).map((id) => ['invites', id]),
  ].slice(0, MAX_IDS);

  // Claim each notification in a transaction (mark it pushed) so it's only ever sent once
  const claimed = [];
  for (const [col, id] of wanted) {
    const ref = a.db.collection(col).doc(id);
    const doc = await a.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const d = snap.data();
      const made = d.createdAt?.toMillis?.() ?? 0;
      if (d.fromEmail !== myEmail || d.pushedAt || Date.now() - made > FRESH_MS) return null;
      tx.update(ref, { pushedAt: FieldValue.serverTimestamp() });
      return d;
    }).catch(() => null);
    if (doc) claimed.push({ col, doc });
  }

  // clicking it opens the app where it was used (the live site, or localhost while trying it out)
  const origin = new URL(req.url).origin;
  let sent = 0;
  for (const { col, doc } of claimed) {
    const msg = pushMessage(doc, col === 'invites' ? 'share' : doc.kind);
    if (!msg) continue;
    const tokens = await a.db.collection('pushTokens').where('email', '==', doc.to).get();
    if (tokens.empty) continue;
    const list = tokens.docs.map((t) => t.id);
    const res = await a.messaging.sendEachForMulticast({
      tokens: list,
      data: { title: msg.title, body: msg.body, link: `${origin}/?list=${doc.listId}`, tag: `list-${doc.listId}` },
      webpush: { headers: { Urgency: 'high', TTL: String(24 * 3600) } },
    }).catch(() => null);
    if (!res) continue;
    sent += res.successCount;
    // forget devices that have gone away (app uninstalled, permission withdrawn…)
    await Promise.all(res.responses.map((r, i) =>
      !r.success && DEAD_TOKEN.has(r.error?.code) ? a.db.collection('pushTokens').doc(list[i]).delete().catch(() => {}) : null));
  }

  return Response.json({ sent });
}
