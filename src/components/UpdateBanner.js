'use client';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import useUpdateCheck from '@/lib/useUpdateCheck';

// A newer version of the app is live while this one is open:
//  • first, a popup in the middle of the screen with everything behind it blurred and unclickable
//  • "Later" closes it, and an "Update app" card stays in the notifications until the app is updated
// Updating is a reload: the app always loads the newest version, so nothing needs reinstalling.
const Ctx = createContext({ ready: false, update: () => {} });
export const useUpdate = () => useContext(Ctx);

const update = () => window.location.reload();

export function UpdateProvider({ children }) {
  const ready = useUpdateCheck();
  const [later, setLater] = useState(false);
  return (
    <Ctx.Provider value={{ ready, update, later, dismiss: () => setLater(true) }}>
      {children}
      {ready && !later && <UpdateModal onLater={() => setLater(true)} />}
    </Ctx.Provider>
  );
}

function Sparkle({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" />
    </svg>
  );
}

function UpdateModal({ onLater }) {
  const btn = useRef(null);

  // only the popup can be used: the app behind it can't be clicked or tabbed into
  useEffect(() => {
    const behind = [...document.querySelectorAll('.shell, .toasts')];
    behind.forEach((el) => { el.inert = true; });
    btn.current?.focus();
    return () => behind.forEach((el) => { el.inert = false; });
  }, []);

  return (
    <div className="upd-scrim">
      <div className="upd-modal" role="alertdialog" aria-modal="true" aria-labelledby="upd-h" aria-describedby="upd-d">
        <span className="upd-ic"><Sparkle size={26} /></span>
        <h2 id="upd-h">A new version is ready</h2>
        <p id="upd-d">Update to get the latest features and fixes. It only takes a second, and nothing you&apos;ve saved is lost.</p>
        <div className="upd-b">
          <button ref={btn} type="button" className="btn primary" onClick={update}>Update now</button>
          <button type="button" className="btn" onClick={onLater}>Later</button>
        </div>
      </div>
    </div>
  );
}

// In the bell's panel and on the Notifications page, until the app is updated
export function UpdateCard({ compact = false }) {
  const { ready } = useUpdate();
  if (!ready) return null;
  return (
    <div className={compact ? 'upd-card compact' : 'upd-card'} role="status">
      <span className="upd-ic"><Sparkle size={compact ? 16 : 18} /></span>
      <div className="upd-card-b">
        <b>Update app</b>
        <span>A new version of Shared To-Do is ready.</span>
      </div>
      <button type="button" className="btn primary" onClick={update}>Update</button>
    </div>
  );
}
