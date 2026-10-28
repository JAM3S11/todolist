// Links on a task: { url, title }. Only http(s), so a link can never run script when clicked.
export const MAX_LINKS = 10;

// 'example.com/page' → 'https://example.com/page'; anything that isn't a web address → null
export function normalizeUrl(input) {
  const v = (input || '').trim();
  if (!v || v.length > 2000) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null;
    return u.href;
  } catch {
    return null;
  }
}

export const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

export const linkLabel = (link) => link.title || hostOf(link.url);
