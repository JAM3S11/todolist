'use client';
import { useEffect, useRef, useState } from 'react';
import { roleLabel } from '@/lib/permissions';
import { timeAgo } from '@/lib/people';
import { useToast } from './Toast';

// The bell in the sidebar: lists people have shared with me, newest first
export default function Notifications({ notes, onOpen, onDismiss }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const known = useRef(null); // ids already on screen, so only new shares pop a toast
  const unread = notes.filter((n) => !n.seen).length;

  // A share that arrives while the app is open shows up as a toast too
  useEffect(() => {
    const ids = new Set(notes.map((n) => n.id));
    if (known.current) {
      const fresh = notes.filter((n) => !n.seen && !known.current.has(n.id));
      if (fresh.length === 1) toast(`${fresh[0].fromName || fresh[0].fromEmail} shared “${fresh[0].listTitle}” with you`);
      else if (fresh.length > 1) toast(`${fresh.length} lists were shared with you`);
    }
    known.current = ids;
  }, [notes, toast]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="notif" ref={box}>
      <button className="bell" type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        aria-label={unread ? `Notifications, ${unread} new` : 'Notifications'}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && <span className="badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="sec-l">Notifications</div>
          {notes.length === 0 && <div className="muted small pad">When someone shares a list with you, it shows up here.</div>}
          {notes.map((n) => (
            <div key={n.id} className={n.seen ? 'notif-item' : 'notif-item new'}>
              <button className="note-open" type="button" onClick={() => { onOpen(n.listId); setOpen(false); }}>
                <span><b>{n.fromName || n.fromEmail}</b> shared <b>“{n.listTitle}”</b> with you</span>
                <span className="note-meta">
                  {n.role && <span className={`pill ${n.role}`}>{roleLabel(n.role)}</span>}
                  <span>{timeAgo(n.createdAt)}</span>
                </span>
              </button>
              <button className="ic" type="button" onClick={() => onDismiss(n.id)} aria-label="Dismiss notification">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
