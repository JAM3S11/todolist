'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { signOut } from 'firebase/auth';
import { fb, friendlyError } from '@/lib/firebase';
import {
  archiveList,
  createList,
  deleteList,
  emailOf,
  getLastListId,
  leaveList,
  markInviteSeen,
  renameList,
  saveLastListId,
  saveListOrder,
  saveProfile,
  setFavorite,
  watchFavorites,
  watchInvites,
  watchListOrder,
  watchOwnedLists,
  watchSharedLists,
} from '@/lib/data';
import { roleLabel } from '@/lib/permissions';
import { Avatar, colorFor, displayName, toDate } from '@/lib/people';
import Board from './Board';
import Calendar, { dueNowCount, taskEntries, useAllTasks } from './Calendar';
import Emblem from './Emblem';
import ListDialog from './ListDialogs';
import ListMenu from './ListMenu';
import Notifications, { NotificationsPage, useNotifications } from './Notifications';
import ListView from './ListView';
import Loading from './Loading';
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
  if (q.get('view') === 'calendar' || q.get('view') === 'notifications') return q.get('view');
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
  const menuBtn = useRef(null);
  const closeBtn = useRef(null);
  const mainRef = useRef(null);

  // ---- the main view scrolls on its own: start each page / list at the top
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [view, activeId]);
  // Desktop sidebar collapsed to icons, remembered on this device (Workspace only renders in the browser, after sign-in)
  const [rail, setRail] = useState(() => {
    try { return localStorage.getItem('sidebar') === 'rail'; } catch { return false; }
  });
  function toggleRail() {
    setRail((r) => {
      try { localStorage.setItem('sidebar', r ? 'full' : 'rail'); } catch {}
      return !r;
    });
  }

  // ---- phone drawer: focus starts on its ✕; Escape closes it and hands focus back to the ☰ button
  useEffect(() => {
    if (!menuOpen) return;
    closeBtn.current?.focus();
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      setMenuOpen(false);
      menuBtn.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

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

  // ---- the order I dragged my lists into (also on my profile)
  const [order, setOrder] = useState([]);
  useEffect(() => watchListOrder(user.uid, setOrder), [user.uid]);
  const rank = useMemo(() => new Map(order.map((id, i) => [id, i])), [order]);

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

  // ---- opening a shared list (from the link, a notification or the sidebar) marks its notification as read,
  // once per visit, so "Mark as unread" while the list is open sticks
  const seenFor = useRef(null);
  useEffect(() => {
    if (view !== 'list') { seenFor.current = null; return; }
    if (seenFor.current === activeId) return;
    const inv = invites.find((i) => i.listId === activeId && !i.seen);
    if (!inv) return;
    seenFor.current = activeId;
    markInviteSeen(inv.id).catch(() => {});
  }, [invites, activeId, view]);

  // ---- remember the open list and view in the address bar, and the list in the database
  useEffect(() => {
    const url = new URL(window.location.href);
    if (activeId) url.searchParams.set('list', activeId);
    if (view === 'board' || view === 'calendar' || view === 'notifications') url.searchParams.set('view', view);
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

  const active = lists?.find((l) => l.id === activeId) || null;
  const dialogList = dialog && lists?.find((l) => l.id === dialog.id);
  // My own drag order once I've set one (new lists go after it), else favourites first; most recently changed breaks ties
  const arrange = (arr) =>
    order.length
      ? [...arr].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity) || 0)
      : [...arr].sort((a, b) => favorites.has(b.id) - favorites.has(a.id));
  const arranged = arrange(lists || []);
  // Tasks of every open list, live: the calendar shows them, the sidebar counts what's due
  const openLists = arranged.filter((l) => !l.archived);
  // every list's tasks (archived too, so My List can search them); the calendar only uses the open lists'
  const allTasks = useAllTasks(arranged);
  const dueNow = dueNowCount(taskEntries(openLists, allTasks));
  // Shares + due / overdue reminders, for the bell and the Notifications page
  const notif = useNotifications({ invites, lists, tasksByList: allTasks, uid: user.uid });
  const showNotifications = () => { setView('notifications'); setMenuOpen(false); };
  const mine = arranged.filter((l) => l.role === 'owner' && !l.archived);
  const others = arranged.filter((l) => l.role !== 'owner' && !l.archived);
  // From dragging on My List: the cards I moved, then everything else in its current place
  const onReorder = (ids) => {
    const moved = new Set(ids);
    report(saveListOrder(user.uid, [...ids, ...arranged.map((l) => l.id).filter((id) => !moved.has(id))]));
  };
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
    <div className={rail ? 'shell rail' : 'shell'}>
      <aside className={menuOpen ? 'side open' : 'side'}>
        <div className="side-top">
          <button ref={menuBtn} className="burger only-mobile" type="button" onClick={() => setMenuOpen(true)}
            aria-expanded={menuOpen} aria-controls="side-body" aria-label="Open menu">
            <span aria-hidden="true" />
          </button>
          <div className="brand"><Emblem size={28} /><span className="brand-name">Shared To-Do</span></div>
          <Notifications api={notif} onOpen={pick} onViewAll={showNotifications} />
          <button className="side-btn collapse only-desktop" type="button" onClick={toggleRail}
            aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'} title={rail ? 'Expand sidebar' : 'Collapse sidebar'}>
            <Icon name="sidebar" />
          </button>
        </div>

        <div className="side-scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />

        <div className="side-body" id="side-body">
          <div className="drawer-head">
            <div className="brand"><Emblem size={26} /><span className="brand-name">Shared To-Do</span></div>
            <button ref={closeBtn} className="side-btn" type="button" onClick={() => { setMenuOpen(false); menuBtn.current?.focus(); }}
              aria-label="Close menu">
              <Icon name="close" />
            </button>
          </div>

          {/* only this middle part scrolls, so the header and my account card always stay on screen */}
          <div className="side-scroll">
            <button type="button" className="new-list" title="New list"
              onClick={() => { setView('board'); setCreating(true); setMenuOpen(false); }}>
              <Icon name="plus" /><span className="lbl">New list</span>
            </button>

            <nav className="group" aria-label="Main">
              <button type="button" className={view === 'board' ? 'nav-i on' : 'nav-i'} title="My List"
                aria-current={view === 'board' ? 'page' : undefined}
                onClick={() => { setView('board'); setMenuOpen(false); }}>
                <Icon name="grid" /><span className="lbl">My List</span>
                <span className="count">{(lists || []).filter((l) => !l.archived).length}</span>
              </button>
              <button type="button" className={view === 'calendar' ? 'nav-i on' : 'nav-i'} title="Calendar"
                aria-current={view === 'calendar' ? 'page' : undefined}
                onClick={() => { setView('calendar'); setMenuOpen(false); }}>
                <Icon name="calendar" /><span className="lbl">Calendar</span>
                {dueNow > 0 && (
                  <span className="due-badge" title={`${dueNow} task${dueNow > 1 ? 's' : ''} due today or overdue`}
                    aria-label={`${dueNow} due today or overdue`}>{dueNow}</span>
                )}
              </button>
              <button type="button" className={view === 'notifications' ? 'nav-i on' : 'nav-i'} title="Notifications"
                aria-current={view === 'notifications' ? 'page' : undefined} onClick={showNotifications}>
                <Icon name="bell" /><span className="lbl">Notifications</span>
                {notif.unread > 0 && <span className="count unread-count" aria-label={`${notif.unread} unread`}>{notif.unread}</span>}
              </button>
            </nav>

            <ListGroup title="Owned by me" lists={mine} {...group}
              empty={lists === null ? <Loading variant="inline" /> : 'Press “New list” to create your first one.'} />
            <ListGroup title="Shared with me" lists={others} {...group}
              empty={lists === null ? '' : 'Lists people share with you appear here.'} />

            {archived.length > 0 && (
              <div className="group">
                <button className="nav-i" type="button" title="Archived" onClick={() => setShowArchived((s) => !s)} aria-expanded={showArchived}>
                  <Icon name="archive" /><span className="lbl">Archived</span>
                  <span className="count">{archived.length}</span>
                </button>
                {showArchived && <ListGroup lists={archived} {...group} />}
              </div>
            )}
          </div>

          <div className="me">
            <Avatar person={{ email, displayName: user.displayName }} size={32} />
            <div className="me-txt">
              <div className="me-name">{user.displayName || email.split('@')[0]}</div>
              <div className="me-email">{user.email}</div>
            </div>
            <button className="side-btn signout" type="button" onClick={onSignOut} aria-label="Sign out" title="Sign out">
              <Icon name="logout" /><span className="signout-lbl">Sign out</span>
            </button>
          </div>
        </div>
      </aside>

      <main className="main" ref={mainRef}>
        {lists === null ? (
          <Loading variant="page" hint="Getting your lists ready" />
        ) : view === 'notifications' ? (
          <NotificationsPage api={notif} onOpen={pick} />
        ) : view === 'calendar' ? (
          <Calendar lists={openLists} byList={allTasks} user={user} onOpen={pick} />
        ) : view === 'board' ? (
          <Board lists={arranged} tasksByList={allTasks} favorites={favorites} actions={actions} onOpen={pick} onNew={() => setCreating(true)}
            onReorder={onReorder} />
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
  const [open, setOpen] = useState(true);
  return (
    <nav className="group" aria-label={title}>
      {title && (
        <button type="button" className="sec-h" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <Icon name="chevron" /><span>{title}</span>
          {lists.length > 0 && <span className="count">{lists.length}</span>}
        </button>
      )}
      {open && lists.length === 0 && empty && <div className="side-empty">{empty}</div>}
      {open && lists.map((l) => (
        <div key={l.id} className={l.id === activeId ? 'list-item on' : 'list-item'}>
          <button type="button" className="list-link" title={l.title} onClick={() => onPick(l.id)}
            aria-current={l.id === activeId ? 'page' : undefined}>
            <span className="li-mark" style={{ background: colorFor(l.id) }} aria-hidden="true">
              {(l.title || '?').trim()[0]?.toUpperCase()}
            </span>
            <span className="ll-title">{l.title}</span>
            {favorites.has(l.id) && <span className="star" aria-label="Favourite">★</span>}
            {l.role !== 'owner' && <span className={`pill ${l.role}`}>{roleLabel(l.role)}</span>}
          </button>
          <ListMenu list={l} favorite={favorites.has(l.id)} actions={actions} />
        </div>
      ))}
    </nav>
  );
}

// Small line icons for the sidebar
const ICONS = {
  plus: <path d="M12 5v14M5 12h14" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  archive: <><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" /></>,
  chevron: <path d="m9 6 6 6-6 6" />,
  sidebar: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 10l-2 2 2 2" /></>,
  logout: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
};

function Icon({ name }) {
  return (
    <svg className={`icon i-${name}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}
