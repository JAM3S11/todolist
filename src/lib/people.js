const COLORS = ['#0f6b5f', '#6a4bc4', '#b4531e', '#2b6cb0', '#a3336d', '#5a7a1f', '#8a5a00', '#4a5a8a'];

export function displayName(person) {
  if (!person) return 'Someone';
  return person.displayName || person.email || 'Someone';
}

export function initials(name = '') {
  if (name.includes('@')) return name[0].toUpperCase();
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';
}

// Stable colour per person, so they look the same everywhere
export function colorFor(key = '') {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function Avatar({ person, size = 28 }) {
  const name = displayName(person);
  return (
    <span
      className="av"
      title={name}
      style={{ background: colorFor(person?.email || name), width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials(name)}
    </span>
  );
}

// Accepts a Firestore Timestamp, a Date, or nothing (a write that hasn't synced yet)
export function toDate(ts) {
  if (!ts) return new Date();
  if (typeof ts.toDate === 'function') return ts.toDate();
  return new Date(ts);
}

export function timeAgo(ts) {
  const d = toDate(ts);
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
