'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

// Toasts: cards stacked at the bottom right, each with a title, an optional description and
// an optional action button (e.g. Undo), plus ✕.
//   const toast = useToast();
//   toast('List renamed')                                    // just a title
//   toast("Couldn't save", 'err')                           // an error
//   const id = toast({ title: 'Task deleted', description: '“Pack boxes”',
//     action: { label: 'Undo', onClick() { …; toast.close(id); } } });
const Ctx = createContext(null);
const noop = Object.assign(() => 0, { add: () => 0, close: () => {} });
export const useToast = () => useContext(Ctx) || noop;

const MAX = 4; // older ones go when a fifth arrives
const LIFE = { ok: 4000, info: 5000, err: 6500 };
let seq = 0;

export function ToastProvider({ children }) {
  const [list, setList] = useState([]);
  const timers = useRef(new Map());

  const close = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    // play the leave animation, then remove it
    setList((l) => l.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), 180);
  }, []);

  const arm = useCallback((t) => {
    clearTimeout(timers.current.get(t.id));
    timers.current.set(t.id, setTimeout(() => close(t.id), t.duration));
  }, [close]);

  const add = useCallback((input, kind) => {
    const o = typeof input === 'string' ? { title: input, kind } : { ...input };
    const t = {
      id: ++seq,
      title: o.title || '',
      description: o.description || '',
      action: o.action || (o.actionProps ? { label: o.actionProps.children, onClick: o.actionProps.onClick } : null),
      kind: o.kind || kind || 'ok',
    };
    t.duration = o.duration || LIFE[t.kind] || LIFE.ok;
    setList((l) => [...l, t].slice(-MAX));
    arm(t);
    return t.id;
  }, [arm]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const api = useMemo(() => Object.assign((input, kind) => add(input, kind), { add, close }), [add, close]);

  // hovering pauses them (so there's time to read or click Undo); leaving starts the clock again
  const pause = () => timers.current.forEach(clearTimeout);
  const resume = () => list.forEach((t) => !t.leaving && arm(t));

  return (
    <Ctx.Provider value={api}>
      {children}
      <ol className="toasts" aria-live="polite" onMouseEnter={pause} onMouseLeave={resume}>
        {list.map((t) => (
          <li key={t.id} className={`toast ${t.kind}${t.leaving ? ' leaving' : ''}`} role={t.kind === 'err' ? 'alert' : 'status'}>
            <span className="toast-ic" aria-hidden="true">
              {t.kind === 'err' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              )}
            </span>
            <div className="toast-b">
              <p className="toast-t">{t.title}</p>
              {t.description && <p className="toast-d">{t.description}</p>}
            </div>
            {t.action && (
              <button type="button" className="toast-a" onClick={() => { t.action.onClick?.(); close(t.id); }}>{t.action.label}</button>
            )}
            <button type="button" className="toast-x" onClick={() => close(t.id)} aria-label="Dismiss">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </li>
        ))}
      </ol>
    </Ctx.Provider>
  );
}
