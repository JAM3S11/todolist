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

// The owner, and Write / Read & write recipients, can change what the letter says
export const saveLetterBody = (id, body) => updateDoc(listRef(id), { body, updatedAt: serverTimestamp() });

export const renameList = (id, title) => updateDoc(listRef(id), { title, updatedAt: serverTimestamp() });

// Archived lists move to their own section for everyone; nothing is deleted
export const archiveList = (id, archived) => updateDoc(listRef(id), { archived });

// Firestore doesn't delete sub-collections automatically, so remove tasks and comments first
export async function deleteList(id) {
  const [tasks, comments] = await Promise.all([getDocs(tasksCol(id)), getDocs(commentsCol(id))]);
  const refs = [...tasks.docs, ...comments.docs].map((d) => d.ref);
  for (let i = 0; i < refs.length; i += 450) {
    const b = writeBatch(db());
    refs.slice(i, i + 450).forEach((r) => b.delete(r));
    await b.commit();
  }
  await writeBatch(db()).delete(listRef(id)).commit();
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
  return b.commit();
}

export const changeAccess = (id, email, permission) => updateDoc(listRef(id), roleField(email), permission);

// The owner removing someone. Clears their notification too.
export function removeAccess(id, email) {
  const b = writeBatch(db());
  b.update(listRef(id), roleField(email), deleteField(), 'memberEmails', arrayRemove(email));
  b.delete(inviteRef(id, email));
  return b.commit();
}

// A member removing themselves. The owner sees they left until sharing with them again.
export function leaveList(id, email) {
  const b = writeBatch(db());
  b.update(listRef(id), roleField(email), deleteField(), 'memberEmails', arrayRemove(email), 'leftEmails', arrayUnion(email));
  b.delete(inviteRef(id, email));
  return b.commit();
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
export function addTask(listId, user, text, due = null, notes = '', time = null) {
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
  return b.commit();
}

export function updateTask(listId, taskId, user, patch) {
  const b = writeBatch(db());
  b.update(doc(tasksCol(listId), taskId), { ...patch, ...stamp(user) });
  b.update(listRef(listId), { updatedAt: serverTimestamp() });
  return b.commit();
}

// links: { url, title } (see lib/links.js). Union/remove, so two people adding at once don't overwrite each other
export const addTaskLink = (listId, taskId, user, link) => updateTask(listId, taskId, user, { links: arrayUnion(link) });
export const removeTaskLink = (listId, taskId, user, link) => updateTask(listId, taskId, user, { links: arrayRemove(link) });

export function deleteTask(listId, taskId) {
  const b = writeBatch(db());
  b.delete(doc(tasksCol(listId), taskId));
  b.update(listRef(listId), { updatedAt: serverTimestamp() });
  return b.commit();
}

// ---------- comments ----------
export function watchComments(listId, onData, onError) {
  return onSnapshot(query(commentsCol(listId), orderBy('createdAt', 'asc')), (s) => onData(withId(s)), onError);
}

export const addComment = (listId, user, text) =>
  addDoc(commentsCol(listId), {
    text,
    userId: user.uid,
    userName: nameOf(user),
    userEmail: emailOf(user),
    createdAt: serverTimestamp(),
  });

export const deleteComment = (listId, id) => writeBatch(db()).delete(doc(commentsCol(listId), id)).commit();

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
