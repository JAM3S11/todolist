'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { signOut } from 'firebase/auth';
import { fb, friendlyError } from '@/lib/firebase';
import {
  archiveList,
  createList,
  deleteList,
  dismissInvite,
  emailOf,
  getLastListId,
  leaveList,
  markInviteSeen,
  renameList,
  saveLastListId,
  saveProfile,
  setFavorite,
  watchFavorites,
  watchInvites,
  watchOwnedLists,
  watchSharedLists,
} from '@/lib/data';
import { roleLabel } from '@/lib/permissions';
import { Avatar, displayName, toDate } from '@/lib/people';
import Board from './Board';
import Emblem from './Emblem';
import ListDialog from './ListDialogs';
import ListMenu from './ListMenu';
import Notifications from './Notifications';
import ListView from './ListView';
import { ToastProvider, useToast } from './Toast';

export default function Workspace(props) {
  return (
    <ToastProvider>
      <WorkspaceInner {...props} />
    </ToastProvider>
  );
}

// Signing in lands on "My List" (the board), unless a shared link (?list=…) points at one list
function initialView() {
  const q = new URLSearchParams(window.location.search);
  return q.get('view') === 'board' || !q.get('list') ? 'board' : 'list';
}

function WorkspaceInner({ user }) {
  const toast = useToast();
  const email = emailOf(user);
  const [owned, setOwned] = useState(null); // null = loading
  const [shared, setShared] = useState(null); // null = loading
  const [invites, setInvites] = useState([]);
  const [favList, setFavList] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [view, setView] = useState(initialView);
  const [dialog, setDialog] = useState(null); // { kind: 'rename' | 'members' | 'delete' | 'leave', id }
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const restored = useRef(false);
  const goingAway = useRef(null); // list I'm deleting or leaving on purpose, so it doesn't count as "access removed"

  // ---- save my profile once per sign-in
  useEffect(() => {
    saveProfile(user).catch(() => {});
  }, [user]);

  // ---- live list of everything I own
  useEffect(
    () => watchOwnedLists(user.uid, setOwned, (e) => { setOwned([]); toast(friendlyError(e), 'err'); }),
    [user.uid, toast],
  );

  // ---- live list of everything shared with me
  useEffect(
    () => watchSharedLists(email, setShared, (e) => { setShared([]); toast(friendlyError(e), 'err'); }),
    [email, toast],
  );

  // ---- live notifications: "X shared a list with you"
  useEffect(() => watchInvites(email, setInvites, () => setInvites([])), [email]);

  // ---- my favourite lists (stored on my profile, so they follow me to any device)
  useEffect(() => watchFavorites(user.uid, setFavList), [user.uid]);
  const favorites = useMemo(() => new Set(favList), [favList]);

  const lists = useMemo(() => {
    // wait for both, so "where I left off" can be a list someone shared with me
    if (owned === null || shared === null) return null;
    const all = [
      ...owned.map((l) => ({ ...l, role: 'owner' })),
      ...shared.map((l) => ({ ...l, role: l.roles?.[email] })).filter((l) => l.role),
    ];
    return all.sort((a, b) => toDate(b.updatedAt) - toDate(a.updatedAt));
  }, [owned, shared, email]);

  // ---- first load: pick the list from the link, else the one I had open last
  useEffect(() => {
    if (lists === null || restored.current) return;
    restored.current = true;
    (async () => {
      const fromUrl = new URLSearchParams(window.location.search).get('list');
      const last = await getLastListId(user.uid).catch(() => null);
      const pick =
        lists.find((l) => l.id === fromUrl)?.id || lists.find((l) => l.id === last)?.id || lists[0]?.id || null;
      if (fromUrl && !lists.some((l) => l.id === fromUrl)) {
        toast("That list isn't shared with this account. Sign in with the email it was sent to.", 'err');
        setView('board');
      }
      setActiveId(pick);
    })();
  }, [lists, user.uid, toast]);

  // ---- opening a shared list (from the link, a notification or the sidebar) marks its notification as read
  useEffect(() => {
    if (view !== 'list') return;
    const inv = invites.find((i) => i.listId === activeId && !i.seen);
    if (inv) markInviteSeen(inv.id).catch(() => {});
  }, [invites, activeId, view]);

  // ---- remember the open list and view in the address bar, and the list in the database
  useEffect(() => {
    const url = new URL(window.location.href);
    if (activeId) url.searchParams.set('list', activeId);
    if (view === 'board') url.searchParams.set('view', 'board');
    else url.searchParams.delete('view');
    window.history.replaceState(null, '', url);
    if (activeId) saveLastListId(user.uid, activeId).catch(() => {});
  }, [activeId, view, user.uid]);

  // ---- if the open list disappears (deleted, or my access was removed), move on
  useEffect(() => {
    if (!lists || !activeId || !restored.current) return;
    if (!lists.some((l) => l.id === activeId)) {
      if (goingAway.current !== activeId) toast('You no longer have access to that list.');
      setActiveId(lists[0]?.id ?? null);
    }
  }, [lists, activeId, toast]);

  // Step off the list first, so its tasks and comments stop listening before it goes away
  async function stepAway(list, work, okMsg, failMsg) {
    goingAway.current = list.id;
    const wasActive = activeId === list.id;
    if (wasActive) setActiveId(lists.find((l) => l.id !== list.id)?.id ?? null);
    try {
      await work();
      toast(okMsg);
    } catch (err) {
      goingAway.current = null;
      if (wasActive) setActiveId(list.id);
      toast(`${failMsg}: ${friendlyError(err)}`, 'err');
    }
  }

  const onLeave = (list) =>
    stepAway(list, () => leaveList(list.id, email), `You left “${list.title}”`, "Couldn't leave the list");
  const onDelete = (list) =>
    stepAway(list, () => deleteList(list.id), `“${list.title}” deleted`, "Couldn't delete the list");

  const report = (promise, okMsg) =>
    promise.then(() => okMsg && toast(okMsg)).catch((e) => toast(`Not saved: ${friendlyError(e)}`, 'err'));

  // What the ⋮ menu on a list can do
  const actions = {
    rename: (l) => setDialog({ kind: 'rename', id: l.id }),
    favorite: (l) => {
      const on = !favorites.has(l.id);
      report(setFavorite(user.uid, l.id, on), on ? `“${l.title}” added to favourites` : 'Removed from favourites');
    },
    members: (l) => setDialog({ kind: 'members', id: l.id }),
    archive: (l) => report(archiveList(l.id, !l.archived), l.archived ? `“${l.title}” is back in your lists` : `“${l.title}” archived`),
    remove: (l) => setDialog({ kind: 'delete', id: l.id }),
    leave: (l) => setDialog({ kind: 'leave', id: l.id }),
  };

  // From the "+" on My List: create, then go straight to the new list. Returns a problem to show, or nothing.
  async function onCreate(title) {
    try {
      const id = await createList(user, title);
      pick(id);
      toast(`“${title}” created. Add your first task.`);
      return null;
    } catch (err) {
      return friendlyError(err);
    }
  }

  // Clear ?list= and ?view= so the next person to sign in here starts on My List
  function onSignOut() {
    window.history.replaceState(null, '', window.location.pathname);
    signOut(fb().auth);
  }

  // Notifications only for lists I can still open (not deleted, access not removed)
  const notes = useMemo(() => {
    const open = new Map((shared || []).map((l) => [l.id, l]));
    return invites
      .filter((i) => open.has(i.listId))
      .map((i) => ({ ...i, listTitle: open.get(i.listId).title, role: open.get(i.listId).roles?.[email] }))
      .sort((a, b) => toDate(b.createdAt) - toDate(a.createdAt));
  }, [invites, shared, email]);

  const active = lists?.find((l) => l.id === activeId) || null;
  const dialogList = dialog && lists?.find((l) => l.id === dialog.id);
  // favourites first, then most recently changed
  const byFav = (arr) => [...arr].sort((a, b) => favorites.has(b.id) - favorites.has(a.id));
  const mine = byFav((lists || []).filter((l) => l.role === 'owner' && !l.archived));
  const others = byFav((lists || []).filter((l) => l.role !== 'owner' && !l.archived));
  const archived = (lists || []).filter((l) => l.archived);
  const pick = (id) => { setActiveId(id); setView('list'); setMenuOpen(false); };
  const group = { activeId: view === 'list' ? activeId : null, onPick: pick, favorites, actions };

  // Everyone I've shared with or who has shared with me: the contacts in the share window
  const contacts = useMemo(() => {
    const m = new Map();
    for (const l of lists || []) {
      if (l.ownerEmail && l.ownerEmail !== email) m.set(l.ownerEmail, { email: l.ownerEmail, displayName: l.ownerName });
      for (const e of l.memberEmails || []) if (e !== email && !m.has(e)) m.set(e, { email: e });
    }
    return [...m.values()].sort((a, b) => displayName(a).localeCompare(displayName(b)));
  }, [lists, email]);

  return (
    <div className="shell">
      <aside className={menuOpen ? 'side open' : 'side'}>
        <div className="side-top">
          <div className="brand"><Emblem size={28} />Shared To-Do</div>
          <Notifications notes={notes} onOpen={pick} onDismiss={(id) => dismissInvite(id).catch(() => {})} />
          <button className="ic only-mobile" type="button" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen}>
            {menuOpen ? 'Close' : 'Lists'}
          </button>
        </div>

        <div className="side-body">
          <button type="button" className={view === 'board' ? 'list-link board-link on' : 'list-link board-link'}
            onClick={() => { setView('board'); setMenuOpen(false); }}>
            <span className="ll-title">▦ My List</span>
            <span className="count">{(lists || []).filter((l) => !l.archived).length}</span>
          </button>

          <ListGroup title="Owned by me" lists={mine} {...group}
            empty={lists === null ? 'Loading…' : 'Open My List and press + to create a list.'} />
          <ListGroup title="Shared with me" lists={others} {...group}
            empty={lists === null ? '' : 'Lists people share with you appear here.'} />

          {archived.length > 0 && (
            <div>
              <button className="arch-toggle" type="button" onClick={() => setShowArchived((s) => !s)} aria-expanded={showArchived}>
                {showArchived ? '▾' : '▸'} Archived ({archived.length})
              </button>
              {showArchived && <ListGroup lists={archived} {...group} />}
            </div>
          )}

          <div className="me">
            <Avatar person={{ email, displayName: user.displayName }} size={30} />
            <div className="me-txt">
              <div className="me-name">{user.displayName || email.split('@')[0]}</div>
              <div className="me-email">{user.email}</div>
            </div>
            <button className="ic" type="button" onClick={onSignOut}>Sign out</button>
          </div>
        </div>
      </aside>

      <main className="main">
        {lists === null ? (
          <div className="center muted">Loading your lists…</div>
        ) : view === 'board' ? (
          <Board lists={lists} favorites={favorites} actions={actions} onOpen={pick} onNew={() => setCreating(true)} />
        ) : active ? (
          <ListView key={active.id} list={active} role={active.role} user={user} contacts={contacts}
            onLeave={actions.leave} onDelete={actions.remove} onArchive={actions.archive}
            menu={<ListMenu list={active} favorite={favorites.has(active.id)} actions={actions} />} />
        ) : (
          <div className="center">
            <div className="card narrow">
              <h2>No lists yet</h2>
              <p className="muted">
                Create your first list from My List. When someone shares a list with {user.email}, it shows up under
                “Shared with me”.
              </p>
              <button className="btn primary" type="button" onClick={() => { setView('board'); setCreating(true); }}>
                + New list
              </button>
            </div>
          </div>
        )}
      </main>

      {creating && (
        <ListDialog dialog={{ kind: 'create' }} contacts={contacts} onCreate={onCreate} onClose={() => setCreating(false)} />
      )}

      {dialogList && (
        <ListDialog dialog={{ kind: dialog.kind, list: dialogList }} contacts={contacts}
          onRename={(l, t) => report(renameList(l.id, t), 'Name saved')}
          onDelete={onDelete} onLeave={onLeave} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}

function ListGroup({ title, lists, activeId, onPick, favorites, actions, empty }) {
  return (
    <nav className="group">
      {title && <div className="sec-l">{title}</div>}
      {lists.length === 0 && empty && <div className="muted small pad">{empty}</div>}
      {lists.map((l) => (
        <div key={l.id} className={l.id === activeId ? 'list-item on' : 'list-item'}>
          <button type="button" className={l.id === activeId ? 'list-link on' : 'list-link'} onClick={() => onPick(l.id)}>
            <span className="ll-title">
              {favorites.has(l.id) && <span className="star" aria-label="Favourite">★ </span>}
              {l.title}
            </span>
            {l.role !== 'owner' && <span className={`pill ${l.role}`}>{roleLabel(l.role)}</span>}
          </button>
          <ListMenu list={l} favorite={favorites.has(l.id)} actions={actions} />
        </div>
      ))}
    </nav>
  );
}
