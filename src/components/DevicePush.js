'use client';
import { useEffect, useState } from 'react';
import { disablePush, enablePush, pushState } from '@/lib/push';
import { useToast } from './Toast';

const DISMISS = 'pushPromptDismissed';

function usePush(user) {
  const toast = useToast();
  const [state, setState] = useState(null); // null while checking
  const [busy, setBusy] = useState(false);
  useEffect(() => { pushState().then(setState); }, []);

  async function run(fn, ok) {
    setBusy(true);
    try {
      const next = await fn();
      setState(next);
      if (next === 'on' && ok) toast(ok);
      if (next === 'blocked') toast('Notifications are blocked for this site. Allow them in your browser settings.', 'err');
    } catch {
      toast("Couldn't turn device notifications on here. Try again, or try another browser.", 'err');
      setState(await pushState());
    }
    setBusy(false);
  }
  return {
    state,
    busy,
    on: () => run(() => enablePush(user), 'Device notifications are on for this device'),
    off: () => run(async () => { await disablePush(); toast('Device notifications are off for this device'); return 'off'; }),
  };
}

const BellIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M11 18h2" />
  </svg>
);

// On the Notifications page: device notifications on or off for this device, and why not when they can't be
export default function DevicePush({ user }) {
  const { state, busy, on, off } = usePush(user);
  if (!state || state === 'unsupported' || state === 'not-set-up') return null;
  if (state === 'ios-needs-home-screen') {
    return <span className="push-note">To get notifications on this iPhone, tap Share → <b>Add to Home Screen</b>, then open the app from there.</span>;
  }
  if (state === 'blocked') {
    return <span className="push-note">Device notifications are blocked. Allow notifications for this site in your browser settings.</span>;
  }
  return state === 'on' ? (
    <button className="btn" type="button" onClick={off} disabled={busy} title="Stop notifications on this device">
      <BellIcon /><span>On for this device · Turn off</span>
    </button>
  ) : (
    <button className="btn primary" type="button" onClick={on} disabled={busy}>
      <BellIcon /><span>{busy ? 'Turning on…' : 'Turn on device notifications'}</span>
    </button>
  );
}

// At the bottom of the bell's panel, until they're on (or the person says not now)
export function PushPrompt({ user }) {
  const { state, busy, on } = usePush(user);
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(DISMISS) === '1'; } catch { return false; } });
  if (hidden || state !== 'off') return null;
  const notNow = () => { setHidden(true); try { localStorage.setItem(DISMISS, '1'); } catch {} };
  return (
    <div className="push-prompt">
      <BellIcon />
      <span>Get these on your phone or computer, even with the app closed.</span>
      <button type="button" className="link small" onClick={on} disabled={busy}>Turn on</button>
      <button type="button" className="ic tiny" onClick={notNow} aria-label="Not now">✕</button>
    </div>
  );
}
