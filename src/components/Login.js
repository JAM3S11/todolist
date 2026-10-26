'use client';
import { useState } from 'react';
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
import Emblem from './Emblem';

const MODES = {
  signin: { label: 'Sign in', button: 'Sign in' },
  signup: { label: 'Create account', button: 'Create account' },
  reset: { label: 'Forgot password', button: 'Send reset link' },
};

export default function Login() {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  // After resetting the password from the email, come back to the app (Vercel, or localhost when
  // testing) on the same list (?list=…). The reset page itself is /auth/action, see README step 10.
  const continueUrl = () => ({ url: appUrl(`/${window.location.search}`) });

  async function submit(e) {
    e.preventDefault();
    const { auth } = fb();
    setBusy(true);
    setMsg(null);
    try {
      if (mode === 'signin') {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else if (mode === 'signup') {
        const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (name.trim()) await updateProfile(user, { displayName: name.trim() });
      } else {
        await sendPasswordResetEmail(auth, email.trim(), continueUrl()).catch(() => sendPasswordResetEmail(auth, email.trim()));
        setMsg({ ok: true, text: `If an account uses ${email.trim()}, a reset link is on its way.` });
      }
    } catch (err) {
      setMsg({ ok: false, text: friendlyError(err) });
    }
    setBusy(false);
  }

  async function google() {
    setBusy(true);
    setMsg(null);
    try {
      await signInWithPopup(fb().auth, new GoogleAuthProvider());
    } catch (err) {
      setMsg({ ok: false, text: friendlyError(err) });
    }
    setBusy(false);
  }

  return (
    <div className="center auth">
      <form className="card narrow login" onSubmit={submit}>
        <div className="login-head">
          <span className="emblem-tile"><Emblem size={46} /></span>
          <h1>Shared To-Do</h1>
          <p className="muted">Your lists, and the ones people share with you, right where you left them.</p>
        </div>

        <button className="btn block google" type="button" onClick={google} disabled={busy}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
            <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
          </svg>
          Continue with Google
        </button>

        <div className="or"><span>or use email</span></div>

        <div className="tabs" role="tablist">
          {Object.entries(MODES).map(([k, m]) => (
            <button key={k} type="button" role="tab" aria-selected={mode === k} className={mode === k ? 'tab on' : 'tab'}
              onClick={() => { setMode(k); setMsg(null); }}>
              {m.label}
            </button>
          ))}
        </div>

        {mode === 'signup' && (
          <label className="field">
            <span>Your name</span>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Joseph Ndirangu" />
          </label>
        )}
        <label className="field">
          <span>Email</span>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        {mode !== 'reset' && (
          <label className="field">
            <span>Password</span>
            <input id="password" type="password" required minLength={6} value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
          </label>
        )}

        {msg && <p className={msg.ok ? 'note ok' : 'note err'}>{msg.text}</p>}

        <button className="btn primary block" type="submit" disabled={busy}>
          {busy ? 'Please wait…' : MODES[mode].button}
        </button>
        <p className="muted small">
          Invited to a list? Sign in or create an account with the email address it was shared to.
        </p>
      </form>
    </div>
  );
}
