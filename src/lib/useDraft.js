'use client';
import { useEffect, useState } from 'react';

// Keeps half-typed text (a new task, a comment) in this browser,
// so an accidental refresh or closed tab doesn't lose it.
export function useDraft(key) {
  const [value, setValue] = useState('');

  useEffect(() => {
    try {
      setValue(localStorage.getItem(key) || '');
    } catch {
      setValue('');
    }
  }, [key]);

  const update = (v) => {
    setValue(v);
    try {
      if (v) localStorage.setItem(key, v);
      else localStorage.removeItem(key);
    } catch {
      /* storage unavailable — draft just isn't kept */
    }
  };

  return [value, update];
}
