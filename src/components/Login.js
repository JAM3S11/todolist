'use client';
import { useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { appUrl } from '@/lib/appUrl';
import { fb, friendlyError } from '@/lib/firebase';
import { Alert, AuthBadge, AuthShell, Icon, PasswordInput, Spinner, Strength } from './AuthShell';

const RESEND_WAIT = 30; // seconds before "Resend email" works again

// Sign in, create an account, forgot password → check your email. Each is its own step.
export default function Login() {
  const [view, setView] = useState(() =>
    new URLSearchParams(window.location.search).get('auth') === 'forgot' ? 'forgot' : 'signin');
  const [moved, setMoved] = useState(false); // after the first step change, focus the new step's first box
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(null); // null | 'email' | 'google'
  const [msg, setMsg] = useState(null); // { kind: 'err' | 'ok', text, action? }
  const [wait, setWait] = useState(0); // resend countdown
  const invited = new URLSearchParams(window.location.search).has('list');

  useEffect(() => {
    if (!wait) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  function go(next) {
    setView(next);
    setMoved(true);
    setMsg(null);
    if (next !== 'signin' && next !== 'signup') setPassword('');
  }

  // After resetting the password from the email, come back to the app (Vercel, or localhost when
  // testing) on the same list (?list=…). The reset page itself is /auth/action, see README step 10.
  const continueUrl = () => {
    const q = new URLSearchParams(window.location.search);
    q.delete('auth');
    const s = q.toString();
    return { url: appUrl(`/${s ? `?${s}` : ''}`) };
  };

  async function submit(e) {
    e.preventDefault();
    const { auth } = fb();
    setBusy('email');
    setMsg(null);
    try {
      if (view === 'signin') {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (name.trim()) await updateProfile(user, { displayName: name.trim() });
      }
    } catch (err) {
      const wrong = ['auth/invalid-credential', 'auth/wrong-password'].includes(err?.code);
      const taken = err?.code === 'auth/email-already-in-use';
      setMsg({
        kind: 'err',
        text: friendlyError(err),
        action: wrong ? { label: 'Reset your password', onClick: () => go('forgot') }
          : taken ? { label: 'Sign in instead', onClick: () => go('signin') } : null,
      });
    }
    setBusy(null);
  }

  async function sendReset(e) {
    e?.preventDefault();
    const { auth } = fb();
    setBusy('email');
    setMsg(null);
    try {
      await sendPasswordResetEmail(auth, email.trim(), continueUrl()).catch(() => sendPasswordResetEmail(auth, email.trim()));
      setWait(RESEND_WAIT);
      if (view === 'sent') setMsg({ kind: 'ok', text: 'Sent again. It can take a minute to arrive.' });
      else go('sent');
    } catch (err) {
      setMsg({ kind: 'err', text: friendlyError(err) });
    }
    setBusy(null);
  }

  async function google() {
    setBusy('google');
    setMsg(null);
    try {
      await signInWithPopup(fb().auth, new GoogleAuthProvider());
    } catch (err) {
      setMsg({ kind: 'err', text: friendlyError(err) });
    }
    setBusy(null);
  }

  const emailField = (
    <div className="field">
      <label htmlFor="email">Email</label>
      <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
        autoComplete="email" inputMode="email" placeholder="you@example.com" autoFocus={moved} />
    </div>
  );

  const googleButton = (
    <>
      <button className="btn block google" type="button" onClick={google} disabled={!!busy}>
        {busy === 'google' ? <Spinner /> : (
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
            <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
          </svg>
        )}
        Continue with Google
      </button>
      <div className="or"><span>or continue with email</span></div>
    </>
  );

  const inviteNote = invited && (
    <div className="auth-invite">
      <Icon name="mail" size={16} />
      <span>You were invited to a list. Use the email address it was shared with.</span>
    </div>
  );

  return (
    <AuthShell>
      <div className="auth-view" key={view}>
        {view === 'signin' && (
          <>
            <div className="auth-title">
              <h1>Welcome back</h1>
              <p>Sign in to your Shared To-Do account.</p>
            </div>
            {inviteNote}
            {googleButton}
            <form className="auth-form" onSubmit={submit}>
              {emailField}
              <div className="field">
                <div className="field-top">
                  <label htmlFor="password">Password</label>
                  <button type="button" className="link" onClick={() => go('forgot')}>Forgot password?</button>
                </div>
                <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="current-password"
                  invalid={msg?.kind === 'err'} />
              </div>
              {msg && <Alert kind={msg.kind} action={msg.action}>{msg.text}</Alert>}
              <button className="btn primary block" type="submit" disabled={!!busy}>
                {busy === 'email' ? <><Spinner />Signing in…</> : 'Sign in'}
              </button>
            </form>
            <p className="auth-alt">
              New to Shared To-Do? <button type="button" className="link" onClick={() => go('signup')}>Create an account</button>
            </p>
          </>
        )}

        {view === 'signup' && (
          <>
            <div className="auth-title">
              <h1>Create your account</h1>
              <p>Start a list and share it in seconds.</p>
            </div>
            {inviteNote}
            {googleButton}
            <form className="auth-form" onSubmit={submit}>
              <div className="field">
                <label htmlFor="name">Full name</label>
                <input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name"
                  placeholder="e.g. Joseph Ndirangu" autoFocus={moved} />
              </div>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email" inputMode="email" placeholder="you@example.com" />
              </div>
              <div className="field">
                <label htmlFor="password">Password</label>
                <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="new-password" />
                <Strength password={password} />
              </div>
              {msg && <Alert kind={msg.kind} action={msg.action}>{msg.text}</Alert>}
              <button className="btn primary block" type="submit" disabled={!!busy}>
                {busy === 'email' ? <><Spinner />Creating account…</> : 'Create account'}
              </button>
            </form>
            <p className="auth-alt">
              Already have an account? <button type="button" className="link" onClick={() => go('signin')}>Sign in</button>
            </p>
          </>
        )}

        {view === 'forgot' && (
          <>
            <button type="button" className="auth-back" onClick={() => go('signin')}>
              <Icon name="back" size={16} />Back to sign in
            </button>
            <AuthBadge icon="key" />
            <div className="auth-title">
              <h1>Forgot your password?</h1>
              <p>No problem. Enter the email you sign in with and we&apos;ll send you a link to choose a new one.</p>
            </div>
            <form className="auth-form" onSubmit={sendReset}>
              {emailField}
              {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
              <button className="btn primary block" type="submit" disabled={!!busy}>
                {busy ? <><Spinner />Sending…</> : 'Send reset link'}
              </button>
            </form>
          </>
        )}

        {view === 'sent' && (
          <>
            <AuthBadge icon="mail" tone="ok" />
            <div className="auth-title">
              <h1>Check your email</h1>
              <p>
                If an account uses <b className="auth-email">{email.trim()}</b>, a link to reset your password is on its way.
                It expires in 1 hour.
              </p>
            </div>
            <ul className="auth-tips">
              <li>Can&apos;t find it? Look in your spam or promotions folder.</li>
              <li>The link opens a page where you choose a new password, then signs you straight in.</li>
            </ul>
            {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
            <button className="btn primary block" type="button" onClick={() => go('signin')}>Back to sign in</button>
            <p className="auth-alt">
              Didn&apos;t get it?{' '}
              <button type="button" className="link" onClick={() => sendReset()} disabled={!!busy || wait > 0}>
                {wait > 0 ? `Resend in ${wait}s` : busy ? 'Sending…' : 'Resend email'}
              </button>
              {' · '}
              <button type="button" className="link" onClick={() => go('forgot')}>Use a different email</button>
            </p>
          </>
        )}
      </div>
    </AuthShell>
  );
}
