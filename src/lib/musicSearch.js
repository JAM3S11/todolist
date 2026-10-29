// Finding songs by name, with no keys or accounts: Apple's public iTunes Search API lists matching songs
// (title, artist, album, year, length, cover), so people can pick the right version before getting its Spotify link.

const COVER = /^https:\/\/[a-z0-9.-]+\.mzstatic\.com\//i;

// 'suzanna' → [{ key, title, artist, album, year, ms, explicit, image }], up to 10. signal: an AbortController's, to drop stale searches.
export async function searchSongs(term, signal) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term.trim())}&media=music&entity=song&limit=10`;
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(r.statusText);
  const { results = [] } = await r.json();
  return results
    .filter((s) => s.kind === 'song' && s.trackName && s.artistName)
    .map((s) => ({
      key: String(s.trackId),
      title: s.trackName,
      artist: s.artistName,
      album: s.collectionName || '',
      year: (s.releaseDate || '').slice(0, 4),
      ms: s.trackTimeMillis || 0,
      explicit: s.trackExplicitness === 'explicit',
      image: COVER.test(s.artworkUrl100 || '') ? s.artworkUrl100.replace('100x100bb', '200x200bb') : '',
    }));
}

// 232000 → '3:52'
export const songLength = (ms) => (ms ? `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}` : '');

// 'Suzanna (feat. X) - Live Version' → 'suzanna'
const bare = (t) =>
  (t || '')
    .toLowerCase()
    .replace(/[([].*?[)\]]/g, ' ')
    .replace(/\s-\s.*$/, ' ')
    .replace(/\b(feat|ft)\.?\s.*$/, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

// Loosely the same song title? (so a picked artist is only attached to the song it belongs to)
export function sameSong(a, b) {
  const x = bare(a);
  const y = bare(b);
  return !!x && !!y && (x.includes(y) || y.includes(x));
}
