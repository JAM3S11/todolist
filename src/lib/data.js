// Every read and write the app makes to Firestore lives in this file.
import {
  FieldPath,
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { fb } from './firebase';

const db = () => fb().db;
const listRef = (id) => doc(db(), 'lists', id);
const tasksCol = (id) => collection(db(), 'lists', id, 'tasks');
const commentsCol = (id) => collection(db(), 'lists', id, 'comments');
const roleField = (email) => new FieldPath('roles', email);

export const emailOf = (user) => (user.email || '').toLowerCase();
export const nameOf = (user) => user.displayName || (user.email || '').split('@')[0];

// ---------- profile + "where I left off" ----------
export async function saveProfile(user) {
  await setDoc(
    doc(db(), 'users', user.uid),
    { email: emailOf(user), displayName: nameOf(user), updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function getLastListId(uid) {
  const snap = await getDoc(doc(db(), 'users', uid));
  return snap.exists() ? snap.data().lastListId || null : null;
}

export function saveLastListId(uid, listId) {
  return setDoc(doc(db(), 'users', uid), { lastListId: listId, updatedAt: serverTimestamp() }, { merge: true });
}

// Favourites are personal, so they live on my profile rather than on the list
export function watchFavorites(uid, onData) {
  return onSnapshot(doc(db(), 'users', uid), (s) => onData(s.exists() ? s.data().favorites || [] : []), () => onData([]));
}

export const setFavorite = (uid, listId, on) =>
  setDoc(
    doc(db(), 'users', uid),
    { favorites: on ? arrayUnion(listId) : arrayRemove(listId), updatedAt: serverTimestamp() },
    { merge: true },
  );

// The order I dragged my lists into on My List (also personal, so also on my profile)
export function watchListOrder(uid, onData) {
  return onSnapshot(doc(db(), 'users', uid), (s) => onData(s.exists() ? s.data().listOrder || [] : []), () => onData([]));
}

export const saveListOrder = (uid, ids) =>
  setDoc(doc(db(), 'users', uid), { listOrder: ids.slice(0, 500), updatedAt: serverTimestamp() }, { merge: true });

// The Spotify link in my sidebar player, i.e. what's playing (on my profile, so it follows me to any device). '' = none.
export function watchSpotify(uid, onData) {
  return onSnapshot(doc(db(), 'users', uid), (s) => onData(s.exists() ? s.data().spotify || '' : ''), () => onData(''));
}

export const saveSpotify = (uid, url) =>
  setDoc(doc(db(), 'users', uid), { spotify: url, updatedAt: serverTimestamp() }, { merge: true });

// The songs I kept on the Music page: [{ type, id, title, image, addedAt }], newest first
export function watchMusic(uid, onData) {
  return onSnapshot(doc(db(), 'users', uid), (s) => onData(s.exists() ? s.data().music || [] : []), () => onData([]));
}

export const saveMusic = (uid, items) =>
  setDoc(doc(db(), 'users', uid), { music: items.slice(0, 100), updatedAt: serverTimestamp() }, { merge: true });

// ---------- lists ----------
const withId = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));

// Lists I own (live)
export function watchOwnedLists(uid, onData, onError) {
  return onSnapshot(query(collection(db(), 'lists'), where('ownerId', '==', uid)), (s) => onData(withId(s)), onError);
}

// Lists shared with my email (live)
export function watchSharedLists(email, onData, onError) {
  return onSnapshot(
    query(collection(db(), 'lists'), where('memberEmails', 'array-contains', email)),
    (s) => onData(withId(s)),
    onError,
  );
}

// kind: 'list' (to-do) or 'letter' (a love letter: a written body, shared with one person at most)
export async function createList(user, title, kind = 'list') {
  const ref = await addDoc(collection(db(), 'lists'), {
    title,
    kind,
    ...(kind === 'letter' ? { body: '' } : {}),
    ownerId: user.uid,
    ownerEmail: emailOf(user),
    ownerName: nameOf(user),
    roles: {},
    memberEmails: [],
    leftEmails: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export const createLetter = (user, title) => createList(user, title, 'letter');

// The owner, and Write / Read & write recipients, can change what the letter says.
// tell: let the other person know (the letter view does this once per visit, not on every autosave)
export function saveLetterBody(list, user, body, tell = false) {
  const b = writeBatch(db());
  b.update(listRef(list.id), { body, updatedAt: serverTimestamp() });
  if (tell) notify(b, list, user, 'letter-edit');
  return send(b);
}

export function renameList(list, user, title) {
  const b = writeBatch(db());
  b.update(listRef(list.id), { title, updatedAt: serverTimestamp() });
  notify(b, { ...list, title }, user, 'list-rename', { detail: list.title });
  return send(b);
}

// Archived lists move to their own section for everyone; nothing is deleted
export function archiveList(list, user, archived) {
  const b = writeBatch(db());
  b.update(listRef(list.id), { archived });
  notify(b, list, user, archived ? 'list-archive' : 'list-unarchive');
  return send(b);
}

// Firestore doesn't delete sub-collections automatically, so remove tasks and comments first.
// Everyone on it is told in the same batch that removes the list itself.
export async function deleteList(list, user) {
  const id = list.id;
  const [tasks, comments] = await Promise.all([getDocs(tasksCol(id)), getDocs(commentsCol(id))]);
  const refs = [...tasks.docs, ...comments.docs].map((d) => d.ref);
  for (let i = 0; i < refs.length; i += 450) {
    const b = writeBatch(db());
    refs.slice(i, i + 450).forEach((r) => b.delete(r));
    await b.commit();
  }
  const b = writeBatch(db());
  b.delete(listRef(id));
  notify(b, list, user, 'list-delete');
  await send(b);
}

// ---------- sharing ----------
// One notification per person per list, so sharing again just refreshes it
const inviteRef = (listId, email) => doc(db(), 'invites', `${listId}_${encodeURIComponent(email)}`);

// Add several people at once, and leave each of them a notification
export function shareList(list, emails, permission, inviter) {
  const b = writeBatch(db());
  const args = [];
  emails.forEach((e) => args.push(roleField(e), permission));
  // sharing again with someone who left takes them off the "left the list" section
  args.push('memberEmails', arrayUnion(...emails), 'leftEmails', arrayRemove(...emails), 'updatedAt', serverTimestamp());
  b.update(listRef(list.id), ...args);
  // the people already on it hear who joined (the new people get their own "shared with you")
  notify(b, list, inviter, 'member-added', { detail: emails.join(', '), skip: emails });
  emails.forEach((to) => pushLater(b, 'invites', inviteRef(list.id, to).id));
  emails.forEach((to) =>
    b.set(inviteRef(list.id, to), {
      to,
      listId: list.id,
      listTitle: list.title,
      fromName: nameOf(inviter),
      fromEmail: emailOf(inviter),
      permission,
      seen: false,
      createdAt: serverTimestamp(),
    }),
  );
  return send(b);
}

// The owner changing someone's access: they're told
export function changeAccess(list, user, email, permission) {
  const b = writeBatch(db());
  b.update(listRef(list.id), roleField(email), permission);
  notify(b, list, user, 'access-changed', { detail: permission, only: [email] });
  return send(b);
}

// The owner removing someone. Clears their "shared with you"; they're told, and so is everyone else.
export function removeAccess(list, user, email) {
  const b = writeBatch(db());
  b.update(listRef(list.id), roleField(email), deleteField(), 'memberEmails', arrayRemove(email));
  b.delete(inviteRef(list.id, email));
  notify(b, list, user, 'access-removed', { only: [email] });
  notify(b, list, user, 'member-removed', { detail: email, skip: [email] });
  return send(b);
}

// A member removing themselves. The owner sees they left until sharing with them again.
export function leaveList(list, user) {
  const email = emailOf(user);
  const b = writeBatch(db());
  b.update(listRef(list.id), roleField(email), deleteField(), 'memberEmails', arrayRemove(email), 'leftEmails', arrayUnion(email));
  b.delete(inviteRef(list.id, email));
  notify(b, list, user, 'member-left');
  return send(b);
}

// The owner clearing someone from the "left the list" section without re-sharing
export const clearLeft = (id, email) => updateDoc(listRef(id), 'leftEmails', arrayRemove(email));

// ---------- notifications ----------
export function watchInvites(email, onData, onError) {
  return onSnapshot(query(collection(db(), 'invites'), where('to', '==', email)), (s) => onData(withId(s)), onError);
}

export const markInviteSeen = (id, seen = true) => updateDoc(doc(db(), 'invites', id), { seen });

export const dismissInvite = (id) => writeBatch(db()).delete(doc(db(), 'invites', id)).commit();

// Optional: queue invitation emails for the "Trigger Email" Firebase extension
export async function queueInviteEmails(list, emails, inviter, link) {
  const from = nameOf(inviter);
  const what = list.kind === 'letter' ? 'a love letter' : 'the to-do list';
  await Promise.all(
    emails.map((to) =>
      addDoc(collection(db(), 'mail'), {
        to,
        listId: list.id,
        createdBy: inviter.uid,
        message: {
          subject: `${from} shared “${list.title}” with you`,
          text: `${from} shared ${what} “${list.title}” with you.\n\nOpen it: ${link}\n\nSign in or create an account with ${to} to see it.`,
          html: `<p>${escapeHtml(from)} shared ${what} <b>${escapeHtml(list.title)}</b> with you.</p>
<p><a href="${link}">Open it</a></p>
<p>Sign in or create an account with <b>${escapeHtml(to)}</b> to see it.</p>`,
        },
      }),
    ),
  );
}

// ---------- tasks ----------
export function watchTasks(listId, onData, onError) {
  return onSnapshot(query(tasksCol(listId), orderBy('createdAt', 'desc')), (s) => onData(withId(s)), onError);
}

const stamp = (user) => ({ updatedAt: serverTimestamp(), updatedBy: user.uid, updatedByName: nameOf(user) });

// due: optional 'YYYY-MM-DD' (see lib/dates.js); notes: optional details of what's going to be done;
// time: optional { start: 'HH:MM', mins } on that day (no time = all day)
// list: the list it goes in (just { id } for a list nobody else is on yet)
export function addTask(list, user, text, due = null, notes = '', time = null) {
  const listId = list.id;
  const b = writeBatch(db());
  b.set(doc(tasksCol(listId)), {
    text,
    done: false,
    archived: false,
    ...(due ? { due } : {}),
    ...(notes ? { notes } : {}),
    ...(due && time?.start ? { start: time.start, mins: time.mins || 60 } : {}),
    createdBy: user.uid,
    createdByName: nameOf(user),
    createdAt: serverTimestamp(),
    ...stamp(user),
  });
  b.update(listRef(listId), { updatedAt: serverTimestamp() });
  notify(b, list, user, 'task-add', { text, detail: due || '' });
  return send(b);
}

// What a change to a task was, for the notification
function taskKind(task, patch) {
  if ('done' in patch) return patch.done ? 'task-done' : 'task-undone';
  if ('archived' in patch) return patch.archived ? 'task-archive' : 'task-restore';
  if ('text' in patch) return 'task-edit';
  if ('due' in patch || 'start' in patch) return 'task-due';
  if ('notes' in patch) return 'task-notes';
  return null;
}

// task: the task as it is now (its text goes in the notification). kind: say what this was, if the patch doesn't.
export function updateTask(list, task, user, patch, kind = taskKind(task, patch), detail = '') {
  const b = writeBatch(db());
  b.update(doc(tasksCol(list.id), task.id), { ...patch, ...stamp(user) });
  b.update(listRef(list.id), { updatedAt: serverTimestamp() });
  const due = 'due' in patch ? patch.due || '' : '';
  if (kind) {
    notify(b, list, user, kind, {
      text: patch.text || task.text,
      detail: detail || (kind === 'task-edit' ? task.text : kind === 'task-due' ? (due && patch.start ? `${due} ${patch.start}` : due) : ''),
    });
  }
  return send(b);
}

// links: { url, title } (see lib/links.js). Union/remove, so two people adding at once don't overwrite each other
export const addTaskLink = (list, task, user, link) =>
  updateTask(list, task, user, { links: arrayUnion(link) }, 'task-link', link.title || link.url);
export const removeTaskLink = (list, task, user, link) =>
  updateTask(list, task, user, { links: arrayRemove(link) }, 'task-unlink', link.title || link.url);

export function deleteTask(list, task, user) {
  const b = writeBatch(db());
  b.delete(doc(tasksCol(list.id), task.id));
  b.update(listRef(list.id), { updatedAt: serverTimestamp() });
  notify(b, list, user, 'task-delete', { text: task.text });
  return send(b);
}

// ---------- comments ----------
export function watchComments(listId, onData, onError) {
  return onSnapshot(query(commentsCol(listId), orderBy('createdAt', 'asc')), (s) => onData(withId(s)), onError);
}

// Each comment change also leaves a notification for everyone else on the list who can see the comments,
// in the same batch, so the two always go together
export function addComment(list, user, text) {
  const b = writeBatch(db());
  b.set(doc(commentsCol(list.id)), {
    text,
    userId: user.uid,
    userName: nameOf(user),
    userEmail: emailOf(user),
    createdAt: serverTimestamp(),
  });
  notify(b, list, user, 'comment', { text });
  return send(b);
}

// Only the person who wrote it can change it; it's marked as edited
export function editComment(list, id, user, text) {
  const b = writeBatch(db());
  b.update(doc(commentsCol(list.id), id), { text, editedAt: serverTimestamp() });
  notify(b, list, user, 'comment-edit', { text });
  return send(b);
}

export function deleteComment(list, comment, user) {
  const b = writeBatch(db());
  b.delete(doc(commentsCol(list.id), comment.id));
  notify(b, list, user, 'comment-delete', { text: comment.text });
  return send(b);
}

// ---------- activity: "X did something on a list you share" notifications ----------
// activity/{id}: one per person per event, written in the same batch as the change itself.
// Only the person it's for can read, mark or remove it. Kinds (firestore.rules checks who may send which):
//   comments           comment, comment-edit, comment-delete          (to people who can see the comments)
//   tasks and letters  task-add, task-edit, task-done, task-undone, task-due, task-notes, task-archive,
//                      task-restore, task-delete, task-link, task-unlink, letter-edit
//   the list itself    list-rename, list-archive, list-unarchive, list-delete,
//                      member-added, member-removed, access-changed, access-removed   (owner only)
//   leaving            member-left
const canSeeComments = (permission) => permission === 'comment' || permission === 'readwrite';

// text: what it's about (a task, a comment); detail: the extra bit (old name, a date, someone's email)
// only: just these people; skip: everyone except these
function notify(batch, list, user, kind, { text = '', detail = '', only = null, skip = [] } = {}) {
  const me = emailOf(user);
  const roles = list.roles || {};
  const members = kind.startsWith('comment') ? Object.keys(roles).filter((e) => canSeeComments(roles[e])) : Object.keys(roles);
  const to = (only || [list.ownerEmail, ...members]).filter((e) => e && e !== me && !skip.includes(e));
  for (const email of new Set(to)) {
    const ref = doc(collection(db(), 'activity'));
    pushLater(batch, 'activity', ref.id);
    batch.set(ref, {
      to: email,
      listId: list.id,
      listTitle: (list.title || '').slice(0, 120),
      ...(list.kind === 'letter' ? { letter: true } : {}),
      kind,
      text: String(text).slice(0, 200),
      detail: String(detail).slice(0, 200),
      fromName: nameOf(user).slice(0, 120),
      fromEmail: me,
      seen: false,
      createdAt: serverTimestamp(),
    });
  }
}

// ---------- device notifications (push) ----------
// After a batch that wrote notifications is saved, /api/push sends them to the devices of the people
// they're for. Fire and forget: a push that fails never undoes or holds up the change itself.
const toPush = new WeakMap(); // batch → { activity: [ids], invites: [ids] }

function pushLater(batch, kind, id) {
  const p = toPush.get(batch) || { activity: [], invites: [] };
  p[kind].push(id);
  toPush.set(batch, p);
}

async function send(batch) {
  await batch.commit();
  const p = toPush.get(batch);
  const me = fb().auth.currentUser;
  if (!p || !me || (!p.activity.length && !p.invites.length)) return;
  me.getIdToken()
    .then((token) => fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(p),
      keepalive: true, // still goes if the page is closed right after
    }))
    .catch(() => {});
}

// This device's push token, so /api/push can reach it. Only the server reads these.
export const savePushToken = (user, token, device) =>
  setDoc(doc(db(), 'pushTokens', token), {
    uid: user.uid,
    email: emailOf(user),
    device: String(device || '').slice(0, 200),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

export const removePushToken = (token) => writeBatch(db()).delete(doc(db(), 'pushTokens', token)).commit();

export function watchActivity(email, onData, onError) {
  return onSnapshot(query(collection(db(), 'activity'), where('to', '==', email)), (s) => onData(withId(s)), onError);
}

export const markActivitySeen = (id, seen = true) => updateDoc(doc(db(), 'activity', id), { seen });

export const dismissActivity = (id) => writeBatch(db()).delete(doc(db(), 'activity', id)).commit();

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
