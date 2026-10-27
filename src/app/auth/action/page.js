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
import { Alert, AuthBadge, AuthShell, PasswordInput, Spinner, Strength, passwordScore } from '@/components/AuthShell';
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
    <AuthShell>
      <div className="auth-view" key={stage}>
        {stage === 'checking' && (
          <div className="auth-checking"><Spinner />Checking your link…</div>
        )}

        {stage === 'reset' && (
          <>
            <AuthBadge icon="lock" />
            <div className="auth-title">
              <h1>Set a new password</h1>
              <p>For <b className="auth-email">{email}</b>. You&apos;ll be signed in straight after.</p>
            </div>
            <ResetForm email={email} code={params.code} onDone={() => window.location.assign(nextUrl)} />
          </>
        )}

        {stage === 'done' && (
          <>
            <AuthBadge icon="check" tone="ok" />
            <div className="auth-title">
              <h1>All set</h1>
              <p>{message}</p>
            </div>
            <a className="btn primary block" href={nextUrl}>Continue to Shared To-Do</a>
          </>
        )}

        {stage === 'error' && (
          <>
            <AuthBadge icon="alert" tone="err" />
            <div className="auth-title">
              <h1>This link doesn&apos;t work</h1>
              <p>{message}</p>
            </div>
            <a className="btn primary block" href={appUrl('/?auth=forgot')}>Get a new reset link</a>
            <p className="auth-alt"><a className="link" href={appUrl('/')}>Back to sign in</a></p>
          </>
        )}
      </div>
    </AuthShell>
  );
}

function ResetForm({ email, code, onDone }) {
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!passwordScore(password)) return setErr('Use a password with at least 6 characters.');
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
    <form className="auth-form" onSubmit={submit}>
      {/* lets password managers save the new password against the right account */}
      <input type="email" value={email} autoComplete="username" readOnly hidden />
      <div className="field">
        <label htmlFor="new-password">New password</label>
        <PasswordInput id="new-password" value={password} onChange={setPassword} autoComplete="new-password" autoFocus />
        <Strength password={password} />
      </div>
      <div className="field">
        <label htmlFor="new-password-again">Confirm new password</label>
        <PasswordInput id="new-password-again" value={again} onChange={setAgain} autoComplete="new-password"
          invalid={again.length > 0 && again !== password} />
        {again && (
          <span className={again === password ? 'match ok' : 'match'}>
            {again === password ? '✓ Passwords match' : "Passwords don't match yet"}
          </span>
        )}
      </div>
      {err && <Alert>{err}</Alert>}
      <button className="btn primary block" type="submit" disabled={busy}>
        {busy ? <><Spinner />Saving…</> : 'Save and sign in'}
      </button>
    </form>
  );
}
