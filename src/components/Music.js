'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { friendlyError } from '@/lib/firebase';
import { saveMusic, saveSpotify } from '@/lib/data';
import { sameSong, searchSongs, songLength } from '@/lib/musicSearch';
import { MAX_MUSIC, MAX_SPOTIFY, askToPlay, kindOf, spotifyEmbed, spotifyInfo, spotifyLink, spotifySearchUrl } from '@/lib/spotify';
import { useToast } from './Toast';

const same = (a, b) => a.type === b.type && a.id === b.id;

// The Music page: find songs by name, keep them here, and play them in the sidebar player.
// music: my saved songs, newest first. nowPlaying: the link in the sidebar player ('' = none).
export default function Music({ user, music, nowPlaying }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null); // null = no search yet
  const [active, setActive] = useState(0); // highlighted result, for the arrow keys
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState('');
  const [pending, setPending] = useState(null); // the song I picked, waiting for its Spotify link
  const [link, setLink] = useState('');
  const [err, setErr] = useState('');
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState('');
  const linkInput = useRef(null);
  const filterInput = useRef(null);

  const playing = nowPlaying ? spotifyEmbed(nowPlaying) : null;
  const playingItem = playing && music.find((m) => same(m, playing));
  const fail = (e) => toast(`Not saved: ${friendlyError(e)}`, 'err');
  const play = (item) => { askToPlay(); saveSpotify(user.uid, spotifyLink(item)).catch(fail); };

  // ---- matching songs as I type (Apple's free catalogue), a moment after I stop typing
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults(null); setSearching(false); setSearchErr(''); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      setSearching(true);
      searchSongs(term, ctl.signal)
        .then((r) => { setResults(r); setActive(0); setSearchErr(''); setSearching(false); })
        .catch((e) => {
          if (e.name === 'AbortError') return;
          setSearchErr("Couldn't search right now. Check your connection.");
          setSearching(false);
        });
    }, 350);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);

  // Picked a song: open it on Spotify (Songs tab, that song by that artist) so I can copy its link
  const openOnSpotify = (song) =>
    window.open(spotifySearchUrl(`${song.title} ${song.artist}`, { tracks: true }), '_blank', 'noopener,noreferrer');
  function pick(song) {
    openOnSpotify(song);
    setPending(song);
    setQ('');
    setErr('');
  }

  // Save a Spotify link to my music and play it. The picked song lends its artist (and cover, if Spotify has none),
  // but only when the link really is that song.
  async function add(text) {
    const found = spotifyEmbed(text);
    if (!found) return setErr('That isn’t a Spotify song, album or playlist link');
    setErr('');
    const had = music.find((m) => same(m, found));
    if (had) {
      setLink('');
      setPending(null);
      play(had);
      return toast(`“${had.title}” is already in your music. Playing it now.`);
    }
    if (music.length >= MAX_MUSIC) return setErr(`You can keep up to ${MAX_MUSIC}. Remove one first.`);
    setAdding(true);
    const info = await spotifyInfo(found);
    setAdding(false);
    const song = found.type === 'track' ? pending : null;
    const match = song && (info.ok ? sameSong(info.title, song.title) : true);
    const item = {
      type: found.type, id: found.id,
      title: info.ok || !match ? info.title : song.title,
      image: info.image || (match ? song.image : ''),
      addedAt: Date.now(),
      ...(match && { artist: song.artist }),
    };
    setLink('');
    setPending(null);
    saveMusic(user.uid, [item, ...music]).then(() => toast(`“${item.title}” added to your music`)).catch(fail);
    play(item);
  }

  // ---- Ctrl+V anywhere on the page adds a Spotify link (no need to click into the box first)
  const addRef = useRef(add);
  addRef.current = add;
  useEffect(() => {
    const onPaste = (e) => {
      if (e.target === filterInput.current) return;
      const text = e.clipboardData?.getData('text') || '';
      if (!spotifyEmbed(text)) return;
      e.preventDefault();
      addRef.current(text);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);

  async function pasteAndAdd() {
    try {
      const text = await navigator.clipboard.readText();
      if (spotifyEmbed(text)) return add(text);
      setErr('Your clipboard doesn’t have a Spotify link yet. On Spotify: ⋯ → Share → Copy link.');
    } catch {
      setErr('Your browser didn’t let the app read the clipboard. Press Ctrl+V, or paste into the box below.');
      linkInput.current?.focus();
    }
  }

  function searchKey(e) {
    if (!results?.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % results.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + results.length) % results.length); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(results[active]); }
    else if (e.key === 'Escape') setQ('');
  }

  const remove = (item) =>
    saveMusic(user.uid, music.filter((m) => !same(m, item))).then(() => toast(`“${item.title}” removed`)).catch(fail);

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return f ? music.filter((m) => `${m.title} ${m.artist || ''}`.toLowerCase().includes(f)) : music;
  }, [music, filter]);

  return (
    <div className="board-wrap music-wrap">
      <header className="bar">
        <div className="bar-left">
          <h1>Music</h1>
          <div className="meta">Find songs and keep them here. They play in the sidebar while you work.</div>
        </div>
      </header>

      {playing && (
        <p className="music-now">
          <span className="music-eq" aria-hidden="true"><i /><i /><i /></span>
          Now playing: <b>{playingItem ? [playingItem.title, playingItem.artist].filter(Boolean).join(' · ') : kindOf(playing.type)}</b>
        </p>
      )}

      <section className="music-sec" aria-labelledby="music-find">
        <h2 id="music-find" className="music-h2">Find a song</h2>
        <div role="search">
          <input type="search" className="music-q" placeholder="Type a song name, e.g. Suzanna" value={q}
            onChange={(e) => setQ(e.target.value)} onKeyDown={searchKey} aria-label="Song name" autoComplete="off"
            aria-controls="music-results" aria-expanded={!!results?.length} />
        </div>

        {q.trim().length >= 2 && (
          <div className="music-results" id="music-results" aria-busy={searching}>
            {searchErr ? <p className="link-err" role="alert">{searchErr}</p>
              : results === null ? <p className="music-hint">Searching…</p>
              : results.length === 0 ? <p className="music-hint">No songs found for “{q.trim()}”. Try the artist’s name too.</p>
              : (
                <>
                  <p className="music-hint">Pick the one you mean. Spotify opens on that song so you can copy its link.</p>
                  <ul className="music-list">
                    {results.map((s, i) => (
                      <li key={s.key}>
                        <button type="button" className={i === active ? 'music-hit on' : 'music-hit'} onClick={() => pick(s)}
                          onMouseEnter={() => setActive(i)}>
                          {s.image
                            ? <img className="music-cover" src={s.image} alt="" width="48" height="48" loading="lazy" />
                            : <span className="music-cover blank" aria-hidden="true">♪</span>}
                          <span className="music-t">
                            <b>{s.title}{s.explicit && <span className="music-e" title="Explicit">E</span>}</b>
                            <span>{[s.artist, s.album, s.year, songLength(s.ms)].filter(Boolean).join(' · ')}</span>
                          </span>
                          <span className="music-go" aria-hidden="true">Add ↗</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            <a className="music-more" href={spotifySearchUrl(q)} target="_blank" rel="noopener noreferrer">
              Not here? Search “{q.trim()}” on Spotify ↗
            </a>
          </div>
        )}

        {pending && (
          <div className="music-wait" role="status">
            {pending.image && <img className="music-cover" src={pending.image} alt="" width="48" height="48" />}
            <div className="music-wait-t">
              <p>Waiting for <b>“{pending.title}”</b> by {pending.artist}</p>
              <p className="music-hint">On Spotify, open the song’s ⋯ menu → Share → Copy link, then come back and press <kbd>Ctrl</kbd>+<kbd>V</kbd>.</p>
              <div className="music-wait-b">
                <button className="btn primary" type="button" onClick={pasteAndAdd} disabled={adding}>{adding ? 'Adding…' : 'Paste & add'}</button>
                <button className="btn" type="button" onClick={() => openOnSpotify(pending)}>Open Spotify again</button>
                <button className="btn" type="button" onClick={() => { setPending(null); setErr(''); }}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        <form className="music-row-f" onSubmit={(e) => { e.preventDefault(); add(link); }}>
          {/* not type="url": a spotify: link isn't a web address */}
          <input ref={linkInput} inputMode="url" autoCapitalize="none" spellCheck={false} placeholder="Have a Spotify link already? Paste it here"
            value={link} maxLength={MAX_SPOTIFY} onChange={(e) => { setLink(e.target.value); setErr(''); }} aria-label="Spotify link" autoComplete="off" />
          <button className="btn" type="submit" disabled={!link.trim() || adding}>{adding ? 'Adding…' : 'Add & play'}</button>
        </form>
        {err && <p className="link-err" role="alert">{err}</p>}
      </section>

      <section className="music-sec" aria-labelledby="music-mine">
        <div className="music-head">
          <h2 id="music-mine" className="music-h2">My music <span className="count">{music.length}</span></h2>
          {music.length > 5 && (
            <input ref={filterInput} type="search" className="music-filter" placeholder="Find in my music" value={filter}
              onChange={(e) => setFilter(e.target.value)} aria-label="Find in my music" autoComplete="off" />
          )}
        </div>
        {music.length === 0 ? (
          <div className="nt-empty compact">
            <b>No songs yet</b>
            Type a song name above and pick it. It stays here for next time.
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
                    <span>{[kindOf(m.type), m.artist].filter(Boolean).join(' · ')}{on && ' · Playing'}</span>
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
