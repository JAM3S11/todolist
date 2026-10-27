'use client';
// Loading indicators: the spinning LoaderIcon, and "Loading" with its letters moving in a wave beside it
import { LoaderIcon } from 'lucide-react';

// Pass aria-hidden when text beside it already says what's happening (e.g. "Saving…" in a button)
export function Spinner({ className = '', size = 16, label = 'Loading', ...props }) {
  const a11y = props['aria-hidden'] ? {} : { role: 'status', 'aria-label': label };
  return <LoaderIcon {...a11y} width={size} height={size} className={`spinner ${className}`} {...props} />;
}

// The word, one span per letter, each a little later than the one before
export function WaveText({ text = 'Loading' }) {
  return (
    <span className="wave" aria-hidden="true">
      {[...text].map((ch, i) => (
        <span key={i} style={{ '--i': i }}>{ch === ' ' ? ' ' : ch}</span>
      ))}
    </span>
  );
}

// variant: 'page' (centred, big), 'block' (inside a card or list), 'inline' (a line of small text)
export default function Loading({ text = 'Loading', hint, variant = 'block', className = '' }) {
  const size = variant === 'page' ? 26 : variant === 'inline' ? 14 : 18;
  return (
    <div className={`loading ${variant} ${className}`} role="status" aria-live="polite" aria-label={hint ? `${text} ${hint}` : text}>
      <span className="loading-row">
        <LoaderIcon width={size} height={size} className="spinner" aria-hidden="true" />
        <WaveText text={text} />
      </span>
      {hint && <span className="loading-hint">{hint}</span>}
    </div>
  );
}
