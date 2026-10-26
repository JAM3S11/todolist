'use client';
// Firebase email links land here instead of on *.firebaseapp.com
// (Firebase console → Authentication → Templates → Customize action URL → https://todolist.vercel.app/auth/action).
// Handles: reset password, and (for older accounts) verify email / undo an email change.
import { useEffect, useState } from 'react';
import {
  applyActionCode,
  checkActionCode,
  confirmPasswordReset,
  signInWithEmailAndPassword,
  verifyPasswordResetCode,
} from 'firebase/auth';
import Emblem from '@/components/Emblem';
import { appUrl, isLocalHost, isOurUrl } from '@/lib/appUrl';
import { fb, firebaseConfigured, friendlyError } from '@/lib/firebase';

const BAD_LINK = 'This link has expired or was already used. Ask for a new one from the sign-in page.';

export default function AuthAction() {
  // 'checking' | 'reset' | 'done' | 'error'
  const [stage, setStage] = useState('checking');
  const [params, setParams] = useState(null);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const p = { mode: q.get('mode'), code: q.get('oobCode'), next: q.get('continueUrl') };

    // The console's action URL is the Vercel address. If the reset was requested while testing on
    // localhost, hand the same link over to localhost before the one-time code is used.
    try {
      const next = p.next && new URL(p.next);
      if (next && isLocalHost(next.hostname) && next.origin !== window.location.origin) {
        window.location.replace(`${next.origin}/auth/action${window.location.search}`);
        return;
      }
    } catch {}

    setParams(p);
    if (!firebaseConfigured || !p.code) return fail(BAD_LINK);
    const { auth } = fb();

    if (p.mode === 'resetPassword') {
      verifyPasswordResetCode(auth, p.code).then((e) => { setEmail(e); setStage('reset'); }).catch(() => fail(BAD_LINK));
    } else if (p.mode === 'verifyEmail') {
      applyActionCode(auth, p.code).then(() => done('Your email is verified.')).catch(() => fail(BAD_LINK));
    } else if (p.mode === 'recoverEmail') {
      checkActionCode(auth, p.code)
        .then((info) => applyActionCode(auth, p.code).then(() =>
          done(`Your account email is back to ${info.data.email}. If you didn't ask for the change, reset your password too.`)))
        .catch(() => fail(BAD_LINK));
    } else fail(BAD_LINK);

    function fail(m) { setMessage(m); setStage('error'); }
    function done(m) { setMessage(m); setStage('done'); }
  }, []);

  // Back into the app: the list they came from if the link carried one, else My List
  const nextUrl = params?.next && isOurUrl(params.next) ? params.next : appUrl('/');

  return (
    <div className="center auth">
      <div className="card narrow login">
        <div className="login-head">
          <span className="emblem-tile"><Emblem size={46} /></span>
          <h1>{stage === 'reset' ? 'Choose a new password' : 'Shared To-Do'}</h1>
          {stage === 'reset' && <p className="muted">For <b>{email}</b></p>}
        </div>

        {stage === 'checking' && <p className="muted" style={{ textAlign: 'center' }}>Checking your link…</p>}
        {stage === 'reset' && (
          <ResetForm email={email} code={params.code}
            onDone={() => window.location.assign(nextUrl)} />
        )}
        {(stage === 'done' || stage === 'error') && (
          <>
            <p className={stage === 'done' ? 'note ok' : 'note err'}>{message}</p>
            <a className="btn primary block" href={stage === 'done' ? nextUrl : appUrl('/')}>
              {stage === 'done' ? 'Continue to Shared To-Do' : 'Back to sign in'}
            </a>
          </>
        )}
      </div>
    </div>
  );
}

function ResetForm({ email, code, onDone }) {
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (password.length < 6) return setErr('Use a password with at least 6 characters.');
    if (password !== again) return setErr("The two passwords don't match.");
    setBusy(true);
    setErr('');
    const { auth } = fb();
    try {
      await confirmPasswordReset(auth, code, password);
    } catch (e2) {
      setBusy(false);
      return setErr(e2?.code === 'auth/expired-action-code' || e2?.code === 'auth/invalid-action-code' ? BAD_LINK : friendlyError(e2));
    }
    // Sign straight in with the new password, so they land on My List (or the shared list) ready to go
    await signInWithEmailAndPassword(auth, email, password).catch(() => {});
    onDone();
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <label className="field">
        <span>New password</span>
        <input id="new-password" type="password" autoFocus required minLength={6} autoComplete="new-password"
          value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <label className="field">
        <span>Type it again</span>
        <input id="new-password-again" type="password" required minLength={6} autoComplete="new-password"
          value={again} onChange={(e) => setAgain(e.target.value)} />
      </label>
      {err && <p className="note err">{err}</p>}
      <button className="btn primary block" type="submit" disabled={busy}>
        {busy ? 'Saving…' : 'Save and sign in'}
      </button>
    </form>
  );
}
