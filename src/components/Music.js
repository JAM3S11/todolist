'use client';
import { useMemo, useState } from 'react';
import { friendlyError } from '@/lib/firebase';
import { saveMusic, saveSpotify } from '@/lib/data';
import { MAX_MUSIC, MAX_SPOTIFY, kindOf, spotifyEmbed, spotifyInfo, spotifyLink, spotifySearchUrl } from '@/lib/spotify';
import { useToast } from './Toast';

const same = (a, b) => a.type === b.type && a.id === b.id;

// The Music page: find songs on Spotify, keep them here, and play them in the sidebar player.
// music: my saved songs, newest first. nowPlaying: the link in the sidebar player ('' = none).
export default function Music({ user, music, nowPlaying }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [link, setLink] = useState('');
  const [err, setErr] = useState('');
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState('');

  const playing = nowPlaying ? spotifyEmbed(nowPlaying) : null;
  const playingItem = playing && music.find((m) => same(m, playing));
  const fail = (e) => toast(`Not saved: ${friendlyError(e)}`, 'err');
  const play = (item) => saveSpotify(user.uid, spotifyLink(item)).catch(fail);

  // Spotify's own search, in a new tab: the whole catalogue, no Spotify account linking needed
  function search(e) {
    e.preventDefault();
    if (q.trim()) window.open(spotifySearchUrl(q), '_blank', 'noopener,noreferrer');
  }

  async function add(e) {
    e.preventDefault();
    const found = spotifyEmbed(link);
    if (!found) return setErr('Paste a Spotify song, album or playlist link');
    const had = music.find((m) => same(m, found));
    if (had) {
      setLink('');
      play(had);
      return toast(`“${had.title}” is already in your music. Playing it now.`);
    }
    if (music.length >= MAX_MUSIC) return setErr(`You can keep up to ${MAX_MUSIC}. Remove one first.`);
    setAdding(true);
    const info = await spotifyInfo(found);
    setAdding(false);
    const item = { type: found.type, id: found.id, title: info.title, image: info.image, addedAt: Date.now() };
    setLink('');
    saveMusic(user.uid, [item, ...music]).then(() => toast(`“${item.title}” added to your music`)).catch(fail);
    play(item);
  }

  const remove = (item) =>
    saveMusic(user.uid, music.filter((m) => !same(m, item))).then(() => toast(`“${item.title}” removed`)).catch(fail);

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return f ? music.filter((m) => m.title.toLowerCase().includes(f)) : music;
  }, [music, filter]);

  return (
    <div className="board-wrap music-wrap">
      <header className="bar">
        <div className="bar-left">
          <h1>Music</h1>
          <div className="meta">Find songs on Spotify and keep them here. They play in the sidebar while you work.</div>
        </div>
      </header>

      {playing && (
        <p className="music-now">
          <span className="music-eq" aria-hidden="true"><i /><i /><i /></span>
          Now playing: <b>{playingItem?.title || kindOf(playing.type)}</b>
        </p>
      )}

      <section className="music-sec" aria-labelledby="music-find">
        <h2 id="music-find" className="music-h2">Find a song</h2>
        <form className="music-row-f" onSubmit={search} role="search">
          <input type="search" placeholder="Song, artist or album" value={q} onChange={(e) => setQ(e.target.value)}
            aria-label="Search Spotify" autoComplete="off" />
          <button className="btn" type="submit" disabled={!q.trim()}>Search on Spotify ↗</button>
        </form>
        <form className="music-row-f" onSubmit={add}>
          {/* not type="url": a spotify: link isn't a web address */}
          <input inputMode="url" autoCapitalize="none" spellCheck={false} placeholder="Paste the song’s Spotify link" value={link}
            maxLength={MAX_SPOTIFY} onChange={(e) => { setLink(e.target.value); setErr(''); }} aria-label="Spotify link" autoComplete="off" />
          <button className="btn primary" type="submit" disabled={!link.trim() || adding}>{adding ? 'Adding…' : 'Add & play'}</button>
        </form>
        {err && <p className="link-err" role="alert">{err}</p>}
        <p className="music-hint">On Spotify, open the song’s ⋯ menu → Share → Copy link, then paste it here.</p>
      </section>

      <section className="music-sec" aria-labelledby="music-mine">
        <div className="music-head">
          <h2 id="music-mine" className="music-h2">My music <span className="count">{music.length}</span></h2>
          {music.length > 5 && (
            <input type="search" className="music-filter" placeholder="Find in my music" value={filter}
              onChange={(e) => setFilter(e.target.value)} aria-label="Find in my music" autoComplete="off" />
          )}
        </div>
        {music.length === 0 ? (
          <div className="nt-empty compact">
            <b>No songs yet</b>
            Search for a song above, copy its link and paste it in. It stays here for next time.
          </div>
        ) : shown.length === 0 ? (
          <p className="muted">Nothing matches “{filter}”.</p>
        ) : (
          <ul className="music-list">
            {shown.map((m) => {
              const on = !!playing && same(m, playing);
              return (
                <li key={`${m.type}:${m.id}`} className={on ? 'music-item on' : 'music-item'}>
                  {m.image
                    ? <img className="music-cover" src={m.image} alt="" width="48" height="48" loading="lazy" />
                    : <span className="music-cover blank" aria-hidden="true">♪</span>}
                  <div className="music-t">
                    <b>{m.title}</b>
                    <span>{kindOf(m.type)}{on && ' · Playing'}</span>
                  </div>
                  <button className="btn" type="button" onClick={() => play(m)} disabled={on}>{on ? 'Playing' : 'Play'}</button>
                  <button className="nt-act" type="button" onClick={() => remove(m)} aria-label={`Remove ${m.title}`} title="Remove">✕</button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
