'use client';
import { useEffect, useState } from 'react';
import { watchTasks } from '@/lib/data';
import { roleLabel } from '@/lib/permissions';
import { Avatar, timeAgo } from '@/lib/people';
import ListMenu from './ListMenu';

const TABS = {
  active: { label: 'All lists', empty: '' },
  favorites: { label: 'Favourites', empty: 'Star a list from its ⋮ menu to see it here.' },
  archived: { label: 'Archived', empty: 'Nothing archived.' },
};

// Every list I can open, as cards in a 3-column grid
export default function Board({ lists, favorites, actions, onOpen, onNew }) {
  const [tab, setTab] = useState('active');
  const pick = {
    active: (l) => !l.archived,
    favorites: (l) => !l.archived && favorites.has(l.id),
    archived: (l) => l.archived,
  };
  const count = (k) => lists.filter(pick[k]).length;
  const shown = lists.filter(pick[tab]).sort((a, b) => favorites.has(b.id) - favorites.has(a.id));

  return (
    <div className="board-wrap">
      <header className="bar">
        <div className="bar-left">
          <h1>My List</h1>
          <div className="meta">Every list you own or that&apos;s shared with you</div>
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
        <div className="board">
          {tab === 'active' && (
            <button className="bcard add" type="button" onClick={onNew}>
              <span className="plus-big" aria-hidden="true">+</span>
              {shown.length ? 'New list' : 'Create your first list'}
            </button>
          )}
          {shown.map((l) => (
            <BoardCard key={l.id} list={l} favorite={favorites.has(l.id)} actions={actions} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
}

function BoardCard({ list, favorite, actions, onOpen }) {
  const [tasks, setTasks] = useState(null);
  useEffect(() => watchTasks(list.id, setTasks, () => setTasks([])), [list.id]);

  const open = (tasks || []).filter((t) => !t.archived);
  const done = open.filter((t) => t.done).length;
  const pct = open.length ? Math.round((done / open.length) * 100) : 0;
  const people = [{ email: list.ownerEmail, displayName: list.ownerName }, ...(list.memberEmails || []).map((email) => ({ email }))];

  return (
    <article className={list.archived ? 'bcard archived' : 'bcard'}>
      <div className="bcard-h">
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
