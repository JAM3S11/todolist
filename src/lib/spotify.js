// The Spotify player in the sidebar: a pasted Spotify link, shown with Spotify's own embed player.
export const MAX_SPOTIFY = 200;
export const MAX_MUSIC = 100; // songs kept on the Music page

const TYPES = ['playlist', 'album', 'track', 'artist', 'episode', 'show'];
const ID = /^[A-Za-z0-9]{22}$/;

// 'https://open.spotify.com/intl-en/playlist/37i9…?si=…' or 'spotify:playlist:37i9…' → { type, id, embedUrl }; anything else → null.
// The embed address is built only from the type and id, so a pasted link can't point the player anywhere else.
export function spotifyEmbed(input) {
  const v = (input || '').trim();
  if (!v || v.length > MAX_SPOTIFY) return null;
  let type, id;
  const uri = v.match(/^spotify:([a-z]+):([^:?\s]+)$/i);
  if (uri) {
    [, type, id] = uri;
  } else {
    try {
      const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
      if (u.hostname !== 'open.spotify.com') return null;
      const parts = u.pathname.split('/').filter(Boolean).filter((p) => !/^intl-/i.test(p) && p !== 'embed');
      [type, id] = parts;
    } catch {
      return null;
    }
  }
  type = (type || '').toLowerCase();
  if (!TYPES.includes(type) || !ID.test(id || '')) return null;
  return { type, id, embedUrl: `https://open.spotify.com/embed/${type}/${id}` };
}

// What gets saved: the plain open.spotify.com address, without tracking bits like ?si=
export const spotifyLink = ({ type, id }) => `https://open.spotify.com/${type}/${id}`;

// Spotify's iFrame API (play, restart, and where the song is up to), loaded once. No key needed.
let api;
export function spotifyApi() {
  if (!api) {
    api = new Promise((resolve, reject) => {
      window.onSpotifyIframeApiReady = resolve;
      const s = document.createElement('script');
      s.src = 'https://open.spotify.com/embed/iframe-api/v1';
      s.async = true;
      s.onerror = () => { api = null; reject(new Error('Spotify player could not load')); };
      document.body.appendChild(s);
    });
  }
  return api;
}

// Start playing only when I picked something on this device just now (not when the app opens,
// or when I change the song on another device)
let playAsked = 0;
export const askToPlay = () => { playAsked = Date.now(); };
export const wantsToPlay = () => Date.now() - playAsked < 8000;

// tracks: land on the Songs tab of the results
export const spotifySearchUrl = (q, { tracks = false } = {}) =>
  `https://open.spotify.com/search/${encodeURIComponent(q.trim())}${tracks ? '/tracks' : ''}`;

const KINDS = { track: 'Song', album: 'Album', playlist: 'Playlist', artist: 'Artist', episode: 'Episode', show: 'Podcast' };
export const kindOf = (type) => KINDS[type] || 'Spotify';

// Name and cover for a link, from Spotify's public oEmbed (no key needed). Offline or failed: a plain name, no cover, ok: false.
export async function spotifyInfo(found) {
  try {
    const r = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyLink(found))}`);
    if (!r.ok) throw new Error(r.statusText);
    const j = await r.json();
    const image = /^https:\/\/[a-z0-9.-]+\.(scdn\.co|spotifycdn\.com)\//i.test(j.thumbnail_url || '') ? j.thumbnail_url : '';
    return { title: String(j.title || '').trim().slice(0, 200) || kindOf(found.type), image, ok: true };
  } catch {
    return { title: `Spotify ${kindOf(found.type).toLowerCase()}`, image: '', ok: false };
  }
}
