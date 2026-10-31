// "Send a test notification" in Notification settings: sends one to the caller's own devices,
// so they can see the whole path works (permission, this device's token, the server's settings).
import { admin, caller, DEAD_TOKEN } from '@/lib/pushAdmin';

export const runtime = 'nodejs';

export async function POST(req) {
  const a = await admin();
  if (a.error) return Response.json({ error: a.error }, { status: 503 });
  const me = await caller(a, req);
  if (!me) return Response.json({ error: 'Sign in first.' }, { status: 401 });

  const tokens = await a.db.collection('pushTokens').where('uid', '==', me.uid).get();
  if (tokens.empty) return Response.json({ error: 'No device is turned on for your account yet. Turn on Device notifications first.' }, { status: 404 });

  const list = tokens.docs.map((t) => t.id);
  const origin = new URL(req.url).origin;
  let res;
  try {
    res = await a.messaging.sendEachForMulticast({
      tokens: list,
      data: { title: 'Shared To-Do', body: 'Device notifications are working on this device. 🎉', link: `${origin}/`, tag: 'push-test' },
      webpush: { headers: { Urgency: 'high', TTL: '600' } },
    });
  } catch (e) {
    return Response.json({ error: `Firebase couldn't send it (${e.code || e.message}).` }, { status: 502 });
  }
  await Promise.all(res.responses.map((r, i) =>
    !r.success && DEAD_TOKEN.has(r.error?.code) ? a.db.collection('pushTokens').doc(list[i]).delete().catch(() => {}) : null));
  const why = res.responses.find((r) => !r.success)?.error?.code || null;
  return Response.json({ sent: res.successCount, devices: list.length, error: res.successCount ? null : `Not delivered (${why}).` });
}
