'use client';
import { useEffect, useRef, useState } from 'react';
import { friendlyError } from '@/lib/firebase';
import { saveSpotify } from '@/lib/data';
import { askToPlay, spotifyApi, spotifyEmbed, spotifyLink, wantsToPlay } from '@/lib/spotify';
import { useToast } from './Toast';

const same = (a, b) => a.type === b.type && a.id === b.id;
// one song (or podcast episode) rather than a playlist / album that plays through on its own
const single = (e) => e && (e.type === 'track' || e.type === 'episode');
// The player reports where the song is about once a second, and position === duration when it ends
const atEnd = (d) => d.duration > 0 && d.position >= d.duration - 250;
const closeToEnd = (d) => d.duration > 0 && d.position >= d.duration - 1500;

// Spotify's own player, docked above my account card. The sidebar never unmounts, so the music keeps playing
// while I move between pages and lists. Full songs if I'm signed in to Spotify in this browser, else 30-second previews.
// ⏮ ⏭ move through My music; 🔁 repeats the song. When a song ends, the next one in My music starts.
// link: what's playing ('' = nothing, null = loading). music: My music, the play order.
// onOpenMusic: go to the Music page. icon: the sidebar's music icon (the collapsed rail shows only that).
export default function MusicPlayer({ user, link, music = [], onOpenMusic, icon }) {
  const toast = useToast();
  const [pop, setPop] = useState(false); // rail: player open beside the icon
  const [noApi, setNoApi] = useState(false); // Spotify's player controls didn't load: plain player, no auto-next
  const [paused, setPaused] = useState(true);
  // Compact player and repeat, remembered on this device
  const [small, setSmall] = useState(() => {
    try { return localStorage.getItem('music') === 'small'; } catch { return false; }
  });
  const [repeat, setRepeat] = useState(() => {
    try { return localStorage.getItem('music-repeat') === 'one'; } catch { return false; }
  });
  const box = useRef(null);
  const host = useRef(null); // Spotify's controller puts its player in here
  const ctl = useRef(null);
  const loaded = useRef(''); // the spotify: URI in the player
  const last = useRef({ position: 0, duration: 0, isPaused: true });
  const ended = useRef(false);

  const embed = link ? spotifyEmbed(link) : null;
  const uri = embed ? `spotify:${embed.type}:${embed.id}` : '';
  const at = embed ? music.findIndex((m) => same(m, embed)) : -1;

  // ---- rail popover: a click elsewhere or Escape closes it
  useEffect(() => {
    if (!pop) return;
    const onDown = (e) => { if (!box.current?.contains(e.target)) setPop(false); };
    const onKey = (e) => { if (e.key === 'Escape') setPop(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [pop]);

  function toggleSmall() {
    setSmall(!small);
    try { localStorage.setItem('music', small ? 'big' : 'small'); } catch {}
  }
  function toggleRepeat() {
    setRepeat(!repeat);
    try { localStorage.setItem('music-repeat', repeat ? 'off' : 'one'); } catch {}
  }

  const fail = (e) => toast(`Not saved: ${friendlyError(e)}`, 'err');
  const playItem = (item) => { askToPlay(); saveSpotify(user.uid, spotifyLink(item)).catch(fail); };
  const openMusic = () => { setPop(false); onOpenMusic(); };
  const remove = () => saveSpotify(user.uid, '').then(() => toast('Player closed')).catch(fail);

  // ⏭: the next one in My music (round to the first). auto: the song just ended, so stop after the last one.
  function next(auto = false) {
    if (!music.length) return;
    if (auto && at === music.length - 1) return;
    const item = music[(at + 1) % music.length];
    if (item && !(embed && same(item, embed))) playItem(item);
  }
  // ⏮: a few seconds in, back to the start of this song (like any player); else the one before it
  function prev() {
    if (ctl.current && last.current.position > 3000) return ctl.current.restart();
    if (!music.length) return;
    const item = music[at <= 0 ? music.length - 1 : at - 1];
    if (item && !(embed && same(item, embed))) playItem(item);
    else ctl.current?.restart();
  }

  // ---- a song ended: play it again (🔁), else the next one. Only for single songs: playlists and albums go on by themselves.
  const onUpdate = useRef(null);
  onUpdate.current = (d) => {
    if (d.playingURI && d.playingURI !== loaded.current) return; // a late report about the song before
    const was = last.current;
    last.current = d;
    setPaused(d.isPaused);
    if (!single(embed)) return;
    if (d.position < d.duration - 3000) ended.current = false;
    // at the end, or stopped / jumped back right before it
    const done = atEnd(d) || (closeToEnd(was) && !was.isPaused && (d.isPaused || d.position < was.position));
    if (!done || ended.current) return;
    ended.current = true;
    if (repeat) ctl.current?.restart();
    else next(true);
  };

  // ---- Spotify's player, with controls: made once there's something to play, gone when the player is removed
  const hasEmbed = !!embed;
  const uriNow = useRef(uri);
  uriNow.current = uri;
  useEffect(() => {
    if (!hasEmbed || noApi) return;
    let gone = false;
    let mine = null;
    spotifyApi()
      .then((api) => {
        if (gone || !host.current) return;
        const el = document.createElement('div');
        host.current.appendChild(el);
        loaded.current = uriNow.current;
        api.createController(el, { uri: uriNow.current, width: '100%', height: 152 }, (c) => {
          if (gone) return c.destroy();
          mine = c;
          ctl.current = c;
          c.addListener('playback_update', (e) => onUpdate.current?.(e.data));
          // picked something else while the player was loading
          if (uriNow.current && uriNow.current !== loaded.current) { loaded.current = uriNow.current; c.loadUri(uriNow.current); }
          if (wantsToPlay()) c.addListener('ready', () => c.play());
        });
      })
      .catch(() => setNoApi(true));
    return () => {
      gone = true;
      mine?.destroy();
      ctl.current = null;
      loaded.current = '';
      if (host.current) host.current.textContent = '';
    };
  }, [hasEmbed, noApi]);

  // ---- a different song picked (⏮ ⏭, the Music page, another device): load it, and play it if I asked to here
  useEffect(() => {
    const c = ctl.current;
    if (!c || !uri || uri === loaded.current) return;
    loaded.current = uri;
    ended.current = false;
    last.current = { position: 0, duration: 0, isPaused: true };
    c.loadUri(uri);
    if (wantsToPlay()) c.play();
  }, [uri]);

  if (link === null) return null;
  const canMove = music.length > 1 || (music.length === 1 && at === -1);
  // what ⏭ (or the end of this song) plays next, said under the controls
  const upNext = !single(embed) ? null : at === -1 ? music[0] : music[at + 1];

  return (
    <section ref={box} className={['music', pop && 'pop', embed && 'on'].filter(Boolean).join(' ')} aria-label="Music player">
      <button type="button" className="side-btn music-btn" onClick={() => setPop((p) => !p)} aria-expanded={pop}
        aria-label="Music player" title="Music player">
        {icon}
      </button>
      <div className="music-panel">
        {embed ? (
          <>
            <div className="music-head">
              <span className={paused && !noApi ? 'music-eq still' : 'music-eq'} aria-hidden="true"><i /><i /><i /></span>
              <span className="music-lbl">
                {paused && !noApi ? 'Paused' : 'Now playing'}{at >= 0 && <span className="music-pos"> · {at + 1} of {music.length}</span>}
              </span>
              <button type="button" className="music-ic sm" onClick={openMusic} aria-label="My music" title="My music">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M4 6h11M4 12h11M4 18h7" /><circle cx="18" cy="17" r="2.5" /><path d="M20.5 17V7l-3 1" />
                </svg>
              </button>
              <button type="button" className="music-ic sm" onClick={toggleSmall} aria-label={small ? 'Bigger player' : 'Smaller player'}
                title={small ? 'Bigger player' : 'Smaller player'}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {small ? <path d="M6 15l6-6 6 6" /> : <path d="M6 9l6 6 6-6" />}
                </svg>
              </button>
              <button type="button" className="music-ic sm" onClick={remove} aria-label="Close the player" title="Close the player">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            {noApi ? (
              <iframe className="music-frame" src={embed.embedUrl} height={small ? 80 : 152} loading="lazy" title="Spotify player"
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" />
            ) : (
              <div ref={host} className={small ? 'music-host small' : 'music-host'} />
            )}
            <div className="music-ctl">
              <button type="button" className="music-ic" onClick={prev} disabled={!canMove && !ctl.current}
                aria-label="Previous song" title="Previous song">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h2v14H6zM20 5v14L9.5 12z" /></svg>
              </button>
              <button type="button" className="music-ic" onClick={() => next()} disabled={!canMove}
                aria-label="Next song" title="Next song">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5v14l10.5-7z" /></svg>
              </button>
              <button type="button" className={repeat ? 'music-ic on' : 'music-ic'} onClick={toggleRepeat} aria-pressed={repeat}
                disabled={noApi} aria-label="Repeat this song" title={repeat ? 'Repeating this song' : 'Repeat this song'}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M17 2l4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" />
                  {repeat && <text x="12" y="14.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="currentColor" stroke="none">1</text>}
                </svg>
              </button>
            </div>
            {single(embed) && !noApi && (
              repeat ? <p className="music-next">Repeating this song</p>
                : upNext ? (
                  <button type="button" className="music-next" onClick={() => next()} title="Play it now">
                    Up next: <b>{[upNext.title, upNext.artist].filter(Boolean).join(' · ')}</b>
                  </button>
                )
                : music.length > 0 && <p className="music-next">Last song in My music</p>
            )}
          </>
        ) : (
          <div className="music-empty">
            <div className="music-empty-h">
              <span className="music-badge" aria-hidden="true">{icon}</span>
              <span>
                <b>Music while you work</b>
                <span className="music-hint">{music.length ? `${music.length} song${music.length === 1 ? '' : 's'} in My music` : 'Find songs to play here'}</span>
              </span>
            </div>
            {music.length > 0 && (
              <button type="button" className="btn primary music-go-btn" onClick={() => playItem(music[0])}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15L19.5 12z" /></svg>
                Play my music
              </button>
            )}
            <button type="button" className={music.length ? 'music-link' : 'btn primary music-go-btn'} onClick={openMusic}>
              {music.length ? 'Find more songs' : 'Find a song'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
