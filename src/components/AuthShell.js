'use client';
import { useState } from 'react';
import Emblem from './Emblem';

// Every auth screen (sign in, sign up, forgot password, the emailed reset link): brand panel on the
// left on wide screens, the form on the right. Phones get just the form with the logo above it.
export function AuthShell({ children }) {
  return (
    <div className="auth-split">
      <aside className="auth-brand">
        <div className="auth-logo"><Emblem size={30} />Shared To-Do</div>

        <div className="auth-pitch">
          <h2>Plan together. Get it done.</h2>
          <p>To-do lists you can share with exactly the access each person needs.</p>
          <ul className="auth-points">
            <li><Tick />Share a list to read, comment or edit</li>
            <li><Tick />See changes and comments as they happen</li>
            <li><Tick />Pick up where you left off, on any device</li>
          </ul>
        </div>

        {/* a sample list, just for looks */}
        <div className="auth-mock" aria-hidden="true">
          <div className="auth-mock-h">
            <b>Weekend trip</b>
            <span className="auth-mock-avs"><i style={{ background: '#6a4bc4' }}>K</i><i style={{ background: '#2b6cb0' }}>J</i><i style={{ background: '#b4531e' }}>M</i></span>
          </div>
          <div className="auth-mock-bar"><span /></div>
          <div className="auth-mock-row done"><span />Book the cabin</div>
          <div className="auth-mock-row done"><span />Rent a car</div>
          <div className="auth-mock-row"><span />Plan the hike route</div>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-mobile-brand"><Emblem size={30} />Shared To-Do</div>
        <div className="auth-card">{children}</div>
      </main>
    </div>
  );
}

function Tick() {
  return (
    <span className="tick" aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
    </span>
  );
}

const ICONS = {
  key: <><circle cx="7.5" cy="15.5" r="4.5" /><path d="m10.7 12.3 9.8-9.8M17 6l3 3M14.5 8.5l2 2" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></>,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  back: <path d="M19 12H5M11 18l-6-6 6-6" />,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7c1.9 0 3.6-.6 5-1.4" /><path d="m2 2 20 20M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
};

export function Icon({ name, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

// The round icon above a step's title (key for "forgot", envelope for "check your email", …)
export function AuthBadge({ icon, tone = 'accent' }) {
  return <span className={`auth-badge ${tone}`}><Icon name={icon} size={24} /></span>;
}

// Error or success message under a form, with an optional action ("Reset your password")
export function Alert({ kind = 'err', children, action }) {
  return (
    <div className={`alert ${kind}`} role={kind === 'err' ? 'alert' : 'status'}>
      <Icon name={kind === 'err' ? 'alert' : 'check'} size={16} />
      <div>
        {children}
        {action && <> <button type="button" className="link" onClick={action.onClick}>{action.label}</button></>}
      </div>
    </div>
  );
}

// Password box with a show/hide eye
export function PasswordInput({ id, value, onChange, autoComplete, autoFocus, invalid }) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw">
      <input id={id} type={show ? 'text' : 'password'} required minLength={6} value={value} autoComplete={autoComplete}
        autoFocus={autoFocus} aria-invalid={invalid || undefined} onChange={(e) => onChange(e.target.value)} />
      <button type="button" className="pw-toggle" onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} title={show ? 'Hide password' : 'Show password'}>
        <Icon name={show ? 'eyeOff' : 'eye'} />
      </button>
    </div>
  );
}

// 0 = too short … 4 = strong
export function passwordScore(pw) {
  if (pw.length < 6) return 0;
  let s = 1;
  if (pw.length >= 10) s++;
  if (/[a-z]/i.test(pw) && /\d/.test(pw)) s++;
  if (/[^a-z0-9]/i.test(pw) || (/[a-z]/.test(pw) && /[A-Z]/.test(pw))) s++;
  return Math.min(s, 4);
}

const LEVELS = ['At least 6 characters', 'Weak', 'Fair', 'Good', 'Strong'];

export function Strength({ password }) {
  const score = passwordScore(password);
  return (
    <div className="strength" data-level={password ? score : 0} aria-live="polite">
      <div className="strength-bars" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => <span key={i} className={password && i <= Math.max(score, 1) ? 'on' : ''} />)}
      </div>
      <span>{password ? (score ? LEVELS[score] : 'Too short') : LEVELS[0]}</span>
    </div>
  );
}

export function Spinner() {
  return <span className="spin" aria-hidden="true" />;
}
