'use client';
import { useEffect, useState } from 'react';
import useUpdateCheck from '@/lib/useUpdateCheck';

// "A new version is ready — Update": one tap reloads onto the new version, no reinstalling
export default function UpdateBanner() {
  const ready = useUpdateCheck();
  const [later, setLater] = useState(false);

  // "Later" hides it until the app is next brought back to the front
  useEffect(() => {
    if (!later) return;
    const onShow = () => document.visibilityState === 'visible' && setLater(false);
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [later]);

  if (!ready || later) return null;
  return (
    <div className="update-bar" role="status">
      <span className="update-t">✨ A new version is ready</span>
      <button type="button" className="btn primary" onClick={() => window.location.reload()}>Update</button>
      <button type="button" className="ic" onClick={() => setLater(true)} aria-label="Later">✕</button>
    </div>
  );
}
