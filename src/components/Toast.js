'use client';
import { createContext, useCallback, useContext, useRef, useState } from 'react';

const Ctx = createContext(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }) {
  const [t, setT] = useState(null);
  const timer = useRef();
  const show = useCallback((text, kind = 'ok') => {
    setT({ text, kind });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setT(null), kind === 'err' ? 4500 : 2400);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      {t && (
        <div className={`toast ${t.kind}`} role="status">
          {t.text}
        </div>
      )}
    </Ctx.Provider>
  );
}
