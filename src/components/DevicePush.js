'use client';
import { useEffect, useState } from 'react';
import { disablePush, enablePush, pushState } from '@/lib/push';
import { useToast } from './Toast';

const DISMISS = 'pushPromptDismissed';

export function usePush(user) {
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
    } catch (e) {
      toast(e?.message || "Couldn't turn device notifications on here. Try again, or try another browser.", 'err');
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
