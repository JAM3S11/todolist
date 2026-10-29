'use client';
import { useEffect, useRef, useState } from 'react';
import { friendlyError } from '@/lib/firebase';
import { saveSpotify } from '@/lib/data';
import { spotifyEmbed } from '@/lib/spotify';
import { useToast } from './Toast';

// Spotify's own player, docked above my account card. The sidebar never unmounts, so the music keeps playing
// while I move between pages and lists. Full songs if I'm signed in to Spotify in this browser, else 30-second previews.
// link: what's playing ('' = nothing, null = loading). onOpenMusic: go to the Music page to pick something.
// icon: the sidebar's music icon (the collapsed rail shows only that, and the player floats beside it).
export default function MusicPlayer({ user, link, onOpenMusic, icon }) {
  const toast = useToast();
  const [pop, setPop] = useState(false); // rail: player open beside the icon
  // Compact player, remembered on this device
  const [small, setSmall] = useState(() => {
    try { return localStorage.getItem('music') === 'small'; } catch { return false; }
  });
  const box = useRef(null);

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
    setSmall((s) => {
      try { localStorage.setItem('music', s ? 'big' : 'small'); } catch {}
      return !s;
    });
  }

  const openMusic = () => { setPop(false); onOpenMusic(); };
  const remove = () =>
    saveSpotify(user.uid, '').then(() => toast('Spotify player removed')).catch((e) => toast(`Not saved: ${friendlyError(e)}`, 'err'));

  const embed = link ? spotifyEmbed(link) : null;
  if (link === null) return null;

  return (
    <section ref={box} className={['music', pop && 'pop', embed && 'on'].filter(Boolean).join(' ')} aria-label="Music player">
      <button type="button" className="side-btn music-btn" onClick={() => setPop((p) => !p)} aria-expanded={pop}
        aria-label="Music player" title="Music player">
        {icon}
      </button>
      <div className="music-panel">
        {embed ? (
          <>
            <iframe className="music-frame" src={embed.embedUrl} height={small ? 80 : 152} loading="lazy" title="Spotify player"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" />
            <div className="music-bar">
              <button type="button" className="music-act" onClick={toggleSmall}>{small ? 'Bigger' : 'Smaller'}</button>
              <button type="button" className="music-act" onClick={openMusic}>My music</button>
              <button type="button" className="music-act" onClick={remove}>Remove</button>
            </div>
          </>
        ) : (
          <button type="button" className="music-add" onClick={openMusic}>
            {icon}<span>Play Spotify</span>
          </button>
        )}
      </div>
    </section>
  );
}
