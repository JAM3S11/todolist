'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { friendlyError } from '@/lib/firebase';
import { playSong, stopMusic } from '@/lib/data';
import { askToPlay, kindOf, spotifyApi, spotifyEmbed, spotifyInfo, spotifyLink, wantsToPlay } from '@/lib/spotify';
import NowPlaying, { Controls, Cover, OpenIcon, Seek } from './NowPlaying';
import { useToast } from './Toast';

const same = (a, b) => a.type === b.type && a.id === b.id;
// one song (or podcast episode) rather than a playlist / album that plays through on its own
const single = (e) => e && (e.type === 'track' || e.type === 'episode');
// The player reports where the song is about once a second, and position === duration when it ends
const atEnd = (d) => d.duration > 0 && d.position >= d.duration - 250;
const closeToEnd = (d) => d.duration > 0 && d.position >= d.duration - 1500;
const STILL = { position: 0, duration: 0, isPaused: true, t: 0 };

// A Spotify-style player, docked above my account card: cover, song, a seek bar and ⤨ ⏮ ▶ ⏭ 🔁. The sound comes
// from Spotify's own player, kept out of sight and driven through its iFrame API. The sidebar never unmounts, so the
// music keeps playing while I move between pages and lists. Full songs if I'm signed in to Spotify in this browser,
// else 30-second previews. ⏮ ⏭ move through My music (⤨ in random order); 🔁 repeats the song. When a song ends,
// the next one in My music starts. The cover opens the whole-screen Now Playing view.
// link: what's playing ('' = nothing, null = loading). music: My music, the play order.
// onOpenMusic: go to the Music page. icon: the sidebar's music icon (the collapsed rail shows only that).
export default function MusicPlayer({ user, link, music = [], onOpenMusic, icon }) {
  const toast = useToast();
  const [pop, setPop] = useState(false); // rail: player open beside the icon
  const [full, setFull] = useState(false); // the Now Playing view
  const [noApi, setNoApi] = useState(false); // Spotify's player controls didn't load: plain player, no auto-next
  const [prog, setProg] = useState(STILL);
  const [stuck, setStuck] = useState(false); // asked to play but nothing started: Spotify wants a tap in its own player
  const [info, setInfo] = useState(null); // name and cover of a link that isn't in My music
  // Compact player, repeat and shuffle, remembered on this device
  const [small, setSmall] = useState(() => {
    try { return localStorage.getItem('music') === 'small'; } catch { return false; }
  });
  const [repeat, setRepeat] = useState(() => {
    try { return localStorage.getItem('music-repeat') === 'one'; } catch { return false; }
  });
  const [shuffle, setShuffle] = useState(() => {
    try { return localStorage.getItem('music-shuffle') === 'on'; } catch { return false; }
  });
  const box = useRef(null);
  const host = useRef(null); // Spotify's controller puts its player in here
  const ctl = useRef(null);
  const loaded = useRef(''); // the spotify: URI in the player
  const last = useRef(STILL);
  const ended = useRef(false);
  const waiting = useRef(0); // timer: did asking to play start anything?
  const shuffled = useRef([]); // songs ⏭ left while shuffling, so ⏮ goes back to them

  const embed = link ? spotifyEmbed(link) : null;
  const uri = embed ? `spotify:${embed.type}:${embed.id}` : '';
  const at = embed ? music.findIndex((m) => same(m, embed)) : -1;
  const item = at >= 0 ? music[at] : null;
  const paused = prog.isPaused;

  // ---- rail popover: a click elsewhere or Escape closes it (not while Now Playing is over everything)
  useEffect(() => {
    if (!pop || full) return;
    const onDown = (e) => { if (!box.current?.contains(e.target)) setPop(false); };
    const onKey = (e) => { if (e.key === 'Escape') setPop(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [pop, full]);

  // ---- a link that isn't in My music: its name and cover from Spotify
  const known = !!item;
  useEffect(() => {
    if (!uri || known) return;
    let gone = false;
    const [, type, id] = uri.split(':');
    spotifyInfo({ type, id }).then((i) => { if (!gone) setInfo({ uri, ...i }); });
    return () => { gone = true; };
  }, [uri, known]);

  useEffect(() => () => clearTimeout(waiting.current), []);
  useEffect(() => { if (!link) setFull(false); }, [link]);

  function toggleSmall() {
    setSmall(!small);
    try { localStorage.setItem('music', small ? 'big' : 'small'); } catch {}
  }
  function toggleRepeat() {
    setRepeat(!repeat);
    try { localStorage.setItem('music-repeat', repeat ? 'off' : 'one'); } catch {}
  }
  function toggleShuffle() {
    setShuffle(!shuffle);
    shuffled.current = [];
    try { localStorage.setItem('music-shuffle', shuffle ? 'off' : 'on'); } catch {}
  }

  // Asked Spotify's player to play: if it's still paused a few seconds later, show it so I can press play there
  function expectPlay() {
    clearTimeout(waiting.current);
    waiting.current = setTimeout(() => { if (last.current.isPaused) setStuck(true); }, 4000);
  }
  function togglePlay() {
    const c = ctl.current;
    if (!c) return;
    if (paused) expectPlay();
    c.togglePlay();
  }
  function seek(ms) {
    ctl.current?.seek(ms / 1000);
    setProg((p) => ({ ...p, position: ms, t: performance.now() }));
  }

  const fail = (e) => toast(`Not saved: ${friendlyError(e)}`, 'err');
  // how: 'next', 'previous' or 'auto' (the song before ended); noted in my activity (Notifications)
  const playItem = (song, how) => { askToPlay(); playSong(user, song, spotifyLink(song), how).catch(fail); };
  const openMusic = () => { setPop(false); setFull(false); onOpenMusic(); };
  const remove = () => stopMusic(user).then(() => toast('Player closed')).catch(fail);
  const closeFull = useCallback(() => setFull(false), []);

  // ⏭: the next one in My music (round to the first), or a random one with ⤨. auto: the song just ended,
  // so in order stop after the last one.
  function next(auto = false) {
    if (!music.length) return;
    let i;
    if (shuffle && (music.length > 1 || at === -1)) {
      do i = Math.floor(Math.random() * music.length); while (i === at);
    } else {
      if (auto && at === music.length - 1) return;
      i = (at + 1) % music.length;
    }
    const song = music[i];
    if (!song || (embed && same(song, embed))) return;
    if (shuffle && item) shuffled.current = [...shuffled.current.slice(-50), item];
    playItem(song, auto ? 'auto' : 'next');
  }
  // ⏮: a few seconds in, back to the start of this song (like any player); else the one before it
  // (with ⤨, the one ⏭ left)
  function prev() {
    if (ctl.current && last.current.position > 3000) return ctl.current.restart();
    if (shuffle) {
      const back = shuffled.current.pop();
      if (back && music.some((m) => same(m, back))) return playItem(back, 'previous');
    }
    if (!music.length) return;
    const song = music[at <= 0 ? music.length - 1 : at - 1];
    if (song && !(embed && same(song, embed))) playItem(song, 'previous');
    else ctl.current?.restart();
  }

  // ---- a song ended: play it again (🔁), else the next one. Only for single songs: playlists and albums go on by themselves.
  const onUpdate = useRef(null);
  onUpdate.current = (d) => {
    if (d.playingURI && d.playingURI !== loaded.current) return; // a late report about the song before
    const was = last.current;
    last.current = d;
    setProg({ position: d.position, duration: d.duration, isPaused: d.isPaused, t: performance.now() });
    if (!d.isPaused) { clearTimeout(waiting.current); setStuck(false); }
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
        api.createController(el, { uri: uriNow.current, width: '100%', height: 80 }, (c) => {
          if (gone) return c.destroy();
          mine = c;
          ctl.current = c;
          c.addListener('playback_update', (e) => onUpdate.current?.(e.data));
          // picked something else while the player was loading
          if (uriNow.current && uriNow.current !== loaded.current) { loaded.current = uriNow.current; c.loadUri(uriNow.current); }
          if (wantsToPlay()) c.addListener('ready', () => { c.play(); expectPlay(); });
        });
      })
      .catch(() => setNoApi(true));
    return () => {
      gone = true;
      mine?.destroy();
      ctl.current = null;
      loaded.current = '';
      last.current = STILL;
      setProg(STILL);
      if (host.current) host.current.textContent = '';
    };
  }, [hasEmbed, noApi]);

  // ---- a different song picked (⏮ ⏭, the Music page, another device): load it, and play it if I asked to here
  useEffect(() => {
    const c = ctl.current;
    if (!c || !uri || uri === loaded.current) return;
    loaded.current = uri;
    ended.current = false;
    last.current = STILL;
    setProg(STILL);
    c.loadUri(uri);
    if (wantsToPlay()) { c.play(); expectPlay(); }
  }, [uri]);

  if (link === null) return null;
  const canMove = music.length > 1 || (music.length === 1 && at === -1);
  // what ⏭ (or the end of this song) plays next, said under the controls
  const upNext = !single(embed) ? null : at === -1 ? music[0] : music[at + 1];
  const track = item || (info?.uri === uri ? info : { title: embed ? kindOf(embed.type) : '' });
  const artist = track.artist || (embed ? kindOf(embed.type) : '');
  const href = embed ? spotifyLink(embed) : '';
  const controls = {
    paused, onToggle: noApi ? null : togglePlay, onPrev: prev, onNext: () => next(),
    canPrev: canMove || !!ctl.current, canNext: canMove,
    shuffle, onShuffle: toggleShuffle, repeat, onRepeat: toggleRepeat, noModes: noApi,
  };
  const openFull = () => { if (!noApi) setFull(true); };

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
              {!noApi && (
                <button type="button" className="music-ic sm" onClick={toggleSmall} aria-label={small ? 'Bigger player' : 'Smaller player'}
                  title={small ? 'Bigger player' : 'Smaller player'}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {small ? <path d="M6 15l6-6 6 6" /> : <path d="M6 9l6 6 6-6" />}
                  </svg>
                </button>
              )}
              <button type="button" className="music-ic sm" onClick={remove} aria-label="Close the player" title="Close the player">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            {noApi ? (
              <>
                <iframe className="music-frame" src={embed.embedUrl} height={152} loading="lazy" title="Spotify player"
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" />
                <Controls {...controls} />
              </>
            ) : (
              <>
                <div className={small ? 'mp-track small' : 'mp-track'}>
                  <button type="button" className="mp-art" onClick={openFull} aria-label="Open Now playing" title="Now playing">
                    <Cover src={track.image} size={small ? 40 : 52} />
                  </button>
                  <button type="button" className="mp-tt" onClick={openFull} title="Now playing">
                    <b>{track.title}</b>
                    <span>{artist}</span>
                  </button>
                  {small ? (
                    <>
                      <button type="button" className="mp-play sm" onClick={togglePlay} aria-label={paused ? 'Play' : 'Pause'} title={paused ? 'Play' : 'Pause'}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          {paused ? <path d="M7 4.5v15L19.5 12z" /> : <path d="M6 4h4v16H6zM14 4h4v16h-4z" />}
                        </svg>
                      </button>
                      <button type="button" className="mp-ic" onClick={() => next()} disabled={!canMove} aria-label="Next song" title="Next song">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5v14l10.5-7z" /></svg>
                      </button>
                    </>
                  ) : (
                    <a className="mp-ic" href={href} target="_blank" rel="noopener noreferrer" aria-label="Open in Spotify" title="Open in Spotify">
                      <OpenIcon />
                    </a>
                  )}
                </div>
                {small ? <Seek prog={prog} thin /> : (
                  <>
                    <Seek prog={prog} onSeek={seek} />
                    <Controls {...controls} />
                  </>
                )}
                {stuck && <p className="music-hint mp-stuck">Spotify needs one tap: press play in its player below.</p>}
                {/* Spotify's player: the sound. Out of sight, unless it needs that tap. */}
                <div ref={host} className={stuck ? 'music-host show' : 'music-host'} aria-hidden={!stuck} />
              </>
            )}
            {single(embed) && !noApi && !small && (
              repeat ? <p className="music-next">Repeating this song</p>
                : shuffle && canMove ? <p className="music-next">Shuffle on: a random song from My music is next</p>
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
      {full && embed && (
        <NowPlaying track={{ ...track, artist, type: embed.type }} href={href} prog={prog} onSeek={seek} ctl={controls}
          music={music} at={at} shuffle={shuffle} onClose={closeFull}
          onPlay={(song) => { if (!same(song, embed)) playItem(song, 'pick'); }} />
      )}
    </section>
  );
}
