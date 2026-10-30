'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { songLength } from '@/lib/musicSearch';
import { kindOf } from '@/lib/spotify';

const clock = (ms) => songLength(ms) || '0:00';

export const Cover = ({ src, size, className = 'music-cover' }) => (src
  ? <img className={className} src={src} alt="" width={size} height={size} />
  : <span className={`${className} blank`} aria-hidden="true">♪</span>);

// Where the song is up to. The player reports about once a second, so in between it's worked out from the clock.
// prog: { position, duration, isPaused, t } (ms; t = when it was reported). thin: just a line, for the compact player.
export function Seek({ prog, onSeek, big, thin }) {
  const [now, setNow] = useState(() => performance.now());
  const [drag, setDrag] = useState(null);
  useEffect(() => {
    if (prog.isPaused || !prog.duration) return;
    const t = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(t);
  }, [prog]);

  const live = prog.isPaused ? prog.position : Math.min(prog.duration, prog.position + Math.max(0, now - prog.t));
  const pos = drag ?? live;
  const pct = `${prog.duration ? Math.min(100, (pos / prog.duration) * 100) : 0}%`;
  if (thin) return <div className="mp-line" aria-hidden="true"><i style={{ width: pct }} /></div>;

  const commit = () => {
    if (drag === null) return;
    onSeek(drag);
    setDrag(null);
  };
  return (
    <div className={big ? 'mp-seek big' : 'mp-seek'}>
      <span className="mp-time">{clock(pos)}</span>
      <input type="range" min="0" max={prog.duration || 0} step="1000" value={pos} disabled={!prog.duration}
        style={{ '--pct': pct }} aria-label="Song position" aria-valuetext={`${clock(pos)} of ${clock(prog.duration)}`}
        onChange={(e) => setDrag(+e.target.value)} onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
      <span className="mp-time">{clock(prog.duration)}</span>
    </div>
  );
}

// ⤨ ⏮ ▶ ⏭ 🔁, laid out like Spotify's. No onToggle: no play button (Spotify's own player has it).
export function Controls({ big, paused, onToggle, onPrev, onNext, canPrev, canNext, shuffle, onShuffle, repeat, onRepeat, noModes }) {
  const s = big ? 24 : 18;
  return (
    <div className={big ? 'mp-ctl big' : 'mp-ctl'}>
      <button type="button" className={shuffle ? 'mp-ic on' : 'mp-ic'} onClick={onShuffle} aria-pressed={shuffle}
        disabled={noModes} aria-label="Shuffle My music" title={shuffle ? 'Shuffle on' : 'Shuffle'}>
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
        </svg>
      </button>
      <button type="button" className="mp-ic" onClick={onPrev} disabled={!canPrev} aria-label="Previous song" title="Previous song">
        <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h2v14H6zM20 5v14L9.5 12z" /></svg>
      </button>
      {onToggle && (
        <button type="button" className="mp-play" onClick={onToggle} aria-label={paused ? 'Play' : 'Pause'} title={paused ? 'Play' : 'Pause'}>
          <svg width={big ? 26 : 18} height={big ? 26 : 18} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            {paused ? <path d="M7 4.5v15L19.5 12z" /> : <path d="M6 4h4v16H6zM14 4h4v16h-4z" />}
          </svg>
        </button>
      )}
      <button type="button" className="mp-ic" onClick={onNext} disabled={!canNext} aria-label="Next song" title="Next song">
        <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5v14l10.5-7z" /></svg>
      </button>
      <button type="button" className={repeat ? 'mp-ic on' : 'mp-ic'} onClick={onRepeat} aria-pressed={repeat}
        disabled={noModes} aria-label="Repeat this song" title={repeat ? 'Repeating this song' : 'Repeat this song'}>
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M17 2l4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" />
          {repeat && <text x="12" y="14.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="currentColor" stroke="none">1</text>}
        </svg>
      </button>
    </div>
  );
}

export const OpenIcon = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 17L17 7M9 7h8v8" />
  </svg>
);

// The whole-screen player, like Spotify's Now Playing: big cover over a blur of itself, the controls, and what's next in My music.
// track: { title, artist, image }. ctl: the props for <Controls>. onPlay(item): play a song from the queue.
export default function NowPlaying({ track, href, prog, onSeek, ctl, music, at, shuffle, onPlay, onClose }) {
  const closeBtn = useRef(null);
  const toggle = useRef(ctl.onToggle);
  toggle.current = ctl.onToggle;

  // Escape closes; Space plays / pauses (unless a button or field has it)
  useEffect(() => {
    closeBtn.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      else if (e.key === ' ' && !e.target.closest?.('button, input, textarea, a, [contenteditable]')) {
        e.preventDefault();
        toggle.current?.();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  // up next: the songs after this one, then round to the start
  const queue = at >= 0 ? [...music.slice(at + 1), ...music.slice(0, at)] : music;

  return createPortal(
    <div className="nowp" role="dialog" aria-modal="true" aria-label="Now playing">
      {track.image && <img className="nowp-bg" src={track.image} alt="" />}
      <header className="nowp-top">
        <button ref={closeBtn} type="button" className="mp-ic" onClick={onClose} aria-label="Close Now playing" title="Close (Esc)">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
        </button>
        <span className="nowp-from">
          <small>Playing from</small>
          <b>{at >= 0 ? 'My music' : 'Spotify'}</b>
        </span>
        <a className="mp-ic" href={href} target="_blank" rel="noopener noreferrer" aria-label="Open in Spotify" title="Open in Spotify">
          <OpenIcon size={20} />
        </a>
      </header>
      <div className="nowp-main">
        <div className="nowp-now">
          <Cover src={track.image} size={420} className="nowp-art" />
          <div className="nowp-meta">
            <h2>{track.title}</h2>
            <p>{track.artist || kindOf(track.type)}</p>
          </div>
          <Seek prog={prog} onSeek={onSeek} big />
          <Controls big {...ctl} />
        </div>
        {queue.length > 0 && (
          <aside className="nowp-queue" aria-label="Next in queue">
            <h3>{shuffle ? 'My music · shuffle on' : 'Next from My music'}</h3>
            <ol>
              {queue.map((m) => (
                <li key={`${m.type}:${m.id}`}>
                  <button type="button" className="trk-t nowp-q" onClick={() => onPlay(m)} aria-label={`Play ${m.title}`}>
                    <Cover src={m.image} size={40} />
                    <span className="trk-tt">
                      <b>{m.title}</b>
                      <span>{m.artist || kindOf(m.type)}</span>
                    </span>
                    {m.ms > 0 && <span className="mp-time">{songLength(m.ms)}</span>}
                  </button>
                </li>
              ))}
            </ol>
          </aside>
        )}
      </div>
    </div>,
    document.body,
  );
}
