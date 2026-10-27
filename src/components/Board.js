'use client';
import { useEffect, useRef, useState } from 'react';
import { watchTasks } from '@/lib/data';
import { roleLabel } from '@/lib/permissions';
import { Avatar, timeAgo } from '@/lib/people';
import ListMenu from './ListMenu';

const TABS = {
  active: { label: 'All lists', empty: '' },
  favorites: { label: 'Favourites', empty: 'Star a list from its ⋮ menu to see it here.' },
  archived: { label: 'Archived', empty: 'Nothing archived.' },
};

// Move one id to a new position in a list of ids
function move(ids, id, to) {
  const next = ids.filter((x) => x !== id);
  next.splice(to, 0, id);
  return next;
}

// Every list I can open, as cards in a 3-column grid. On "All lists" the cards can be dragged into my own order.
export default function Board({ lists, favorites, actions, onOpen, onNew, onReorder }) {
  const [tab, setTab] = useState('active');
  const [drag, setDrag] = useState(null); // { id, ids } while dragging; { id: null, ids } after a drop, until the saved order shows up
  const cards = useRef(new Map()); // list id → its card element, to find which card the pointer is over
  const keyMoved = useRef(null); // card moved with the arrow keys, to keep focus on its handle
  const pick = {
    active: (l) => !l.archived,
    favorites: (l) => !l.archived && favorites.has(l.id),
    archived: (l) => l.archived,
  };
  const count = (k) => lists.filter(pick[k]).length;
  const shown = lists.filter(pick[tab]); // already in my order
  const shownIds = shown.map((l) => l.id);
  const shownKey = shownIds.join();
  const canDrag = tab === 'active' && shown.length > 1;

  // While dragging (and just after a drop) show the dragged order
  const byId = new Map(shown.map((l) => [l.id, l]));
  const visible = drag && tab === 'active' ? drag.ids.filter((id) => byId.has(id)).map((id) => byId.get(id)) : shown;

  // The saved order arrived (or the lists changed): stop showing the local copy
  useEffect(() => {
    setDrag((d) => (d && !d.id ? null : d));
    const id = keyMoved.current;
    keyMoved.current = null;
    if (id) cards.current.get(id)?.querySelector('.grip')?.focus();
  }, [shownKey]);

  function startDrag(e, id) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id, ids: shownIds });
  }

  function dragOver(e) {
    if (!drag?.id) return;
    // scroll the page when dragging near the top or bottom edge (long lists, phones)
    // (the main view scrolls on its own on desktop; on phones the page itself scrolls)
    const main = document.querySelector('.main');
    const scroller = main && getComputedStyle(main).overflowY === 'auto' ? main : window;
    if (e.clientY < 70) scroller.scrollBy(0, -14);
    else if (e.clientY > window.innerHeight - 70) scroller.scrollBy(0, 14);
    for (const [id, el] of cards.current) {
      if (id === drag.id) continue;
      const r = el.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        setDrag((d) => ({ ...d, ids: move(d.ids, d.id, d.ids.indexOf(id)) }));
        break;
      }
    }
  }

  function endDrag() {
    if (!drag?.id) return;
    if (drag.ids.join() === shownKey) return setDrag(null);
    onReorder(drag.ids);
    setDrag({ id: null, ids: drag.ids });
  }

  // Arrow keys on a handle move that card one place
  function keyMove(e, id) {
    const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const to = shownIds.indexOf(id) + step;
    if (to < 0 || to >= shownIds.length) return;
    keyMoved.current = id;
    onReorder(move(shownIds, id, to));
  }

  const grip = (id) => ({
    onPointerDown: (e) => startDrag(e, id),
    onPointerMove: dragOver,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    onKeyDown: (e) => keyMove(e, id),
  });

  return (
    <div className="board-wrap">
      <header className="bar">
        <div className="bar-left">
          <h1>My List</h1>
          <div className="meta">
            Every list you own or that&apos;s shared with you{canDrag && ' · drag ⠿ to arrange them'}
          </div>
        </div>
        <div className="bar-right">
          <button className="btn primary" type="button" onClick={onNew}>+ New list</button>
        </div>
      </header>

      <div className="tabs board-tabs" role="tablist">
        {Object.entries(TABS).map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'tab on' : 'tab'} onClick={() => setTab(k)}>
            {t.label} <span className="count">{count(k)}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 && tab !== 'active' ? (
        <div className="muted board-empty">{TABS[tab].empty}</div>
      ) : (
        <div className={drag?.id ? 'board is-dragging' : 'board'}>
          {visible.map((l) => (
            <BoardCard key={l.id} list={l} favorite={favorites.has(l.id)} actions={actions} onOpen={onOpen}
              dragging={drag?.id === l.id} grip={canDrag ? grip(l.id) : null}
              cardRef={(el) => (el ? cards.current.set(l.id, el) : cards.current.delete(l.id))} />
          ))}
          {/* New list comes after my lists */}
          {tab === 'active' && (
            <button className="bcard add" type="button" onClick={onNew}>
              <span className="plus-big" aria-hidden="true">+</span>
              {shown.length ? 'New list' : 'Create your first list'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function BoardCard({ list, favorite, actions, onOpen, dragging, grip, cardRef }) {
  const [tasks, setTasks] = useState(null);
  useEffect(() => watchTasks(list.id, setTasks, () => setTasks([])), [list.id]);

  const open = (tasks || []).filter((t) => !t.archived);
  const done = open.filter((t) => t.done).length;
  const pct = open.length ? Math.round((done / open.length) * 100) : 0;
  const people = [{ email: list.ownerEmail, displayName: list.ownerName }, ...(list.memberEmails || []).map((email) => ({ email }))];

  return (
    <article ref={cardRef} className={['bcard', list.archived && 'archived', dragging && 'dragging'].filter(Boolean).join(' ')}>
      <div className="bcard-h">
        {grip && (
          <button className="grip" type="button" title="Drag to reorder" aria-label={`Move “${list.title}” (arrow keys)`} {...grip}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="9" cy="5" r="1.8" /><circle cx="15" cy="5" r="1.8" />
              <circle cx="9" cy="12" r="1.8" /><circle cx="15" cy="12" r="1.8" />
              <circle cx="9" cy="19" r="1.8" /><circle cx="15" cy="19" r="1.8" />
            </svg>
          </button>
        )}
        <button className="bcard-title" type="button" onClick={() => onOpen(list.id)}>
          {favorite && <span className="star" aria-label="Favourite">★</span>}
          {list.title}
        </button>
        <ListMenu list={list} favorite={favorite} actions={actions} />
      </div>

      <div className="bcard-meta">
        {list.role === 'owner' ? 'Owned by you' : `By ${list.ownerName || list.ownerEmail}`}
        {list.role !== 'owner' && <span className={`pill ${list.role}`}>{roleLabel(list.role)}</span>}
        {list.archived && <span className="pill read">Archived</span>}
      </div>

      <div className="progress" aria-label={`${done} of ${open.length} done`}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="small muted">{tasks === null ? 'Loading…' : `${done}/${open.length} done`}</div>

      <ul className="bcard-tasks" onClick={() => onOpen(list.id)}>
        {open.filter((t) => !t.done).slice(0, 3).map((t) => <li key={t.id}>{t.text}</li>)}
        {tasks && open.length === done && <li className="muted">{open.length ? 'All done 🎉' : 'No tasks yet'}</li>}
      </ul>

      <div className="bcard-f">
        <div className="avatars">{people.slice(0, 5).map((p) => <Avatar key={p.email} person={p} size={26} />)}</div>
        <span className="small muted">{timeAgo(list.updatedAt)}</span>
      </div>
    </article>
  );
}
