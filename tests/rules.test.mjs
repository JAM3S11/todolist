// Checks every access level against firestore.rules using the Firebase emulator.
// Run with:  npm run test:rules   (needs Java 11+ installed)
import { after, before, beforeEach, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  FieldPath, addDoc, arrayRemove, arrayUnion, collection, deleteDoc, deleteField, doc, getDoc, getDocs,
  query, serverTimestamp, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';

let env;
const LIST = 'list1';
const people = {
  owner: { uid: 'owner', email: 'owner@test.com' },
  reader: { uid: 'reader', email: 'reader@test.com' },
  commenter: { uid: 'commenter', email: 'commenter@test.com' },
  writer: { uid: 'writer', email: 'writer@test.com' },
  rw: { uid: 'rw', email: 'rw@test.com' },
  stranger: { uid: 'stranger', email: 'stranger@test.com' },
};
const as = (who, verified = true) =>
  env.authenticatedContext(people[who].uid, { email: people[who].email, email_verified: verified }).firestore();

const task = (uid, extra = {}) => ({
  text: 'A task', done: false, archived: false, createdBy: uid, createdByName: uid,
  createdAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: uid, updatedByName: uid, ...extra,
});
const invite = (to) => ({
  to, listId: LIST, listTitle: 'Moving house', fromName: 'Owner', fromEmail: 'owner@test.com',
  permission: 'read', seen: false, createdAt: serverTimestamp(),
});
const stamp = (uid) => ({ updatedAt: serverTimestamp(), updatedBy: uid, updatedByName: uid });

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-todo',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
after(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'lists', LIST), {
      title: 'Moving house', ownerId: 'owner', ownerEmail: 'owner@test.com', ownerName: 'Owner',
      roles: { 'reader@test.com': 'read', 'commenter@test.com': 'comment', 'writer@test.com': 'write', 'rw@test.com': 'readwrite' },
      memberEmails: ['reader@test.com', 'commenter@test.com', 'writer@test.com', 'rw@test.com'],
      createdAt: new Date(), updatedAt: new Date(),
    });
    await setDoc(doc(db, 'lists', LIST, 'tasks', 't1'), { ...task('owner'), createdAt: new Date(), updatedAt: new Date() });
    await setDoc(doc(db, 'lists', LIST, 'comments', 'c1'), {
      text: 'hello', userId: 'owner', userName: 'Owner', userEmail: 'owner@test.com', createdAt: new Date(),
    });
  });
});

describe('lists', () => {
  test('anyone signed in can create their own list', async () => {
    await assertSucceeds(addDoc(collection(as('stranger'), 'lists'), {
      title: 'Mine', ownerId: 'stranger', ownerEmail: 'stranger@test.com', ownerName: 'S',
      roles: {}, memberEmails: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
  });
  test('cannot create a list owned by someone else', async () => {
    await assertFails(addDoc(collection(as('stranger'), 'lists'), {
      title: 'Fake', ownerId: 'owner', ownerEmail: 'owner@test.com', roles: {}, memberEmails: [],
    }));
  });
  for (const who of ['owner', 'reader', 'commenter', 'writer', 'rw']) {
    test(`${who} can open the list`, () => assertSucceeds(getDoc(doc(as(who), 'lists', LIST))));
  }
  test('stranger cannot open the list', () => assertFails(getDoc(doc(as('stranger'), 'lists', LIST))));
  test('member with an unverified email can open the list', () => assertSucceeds(getDoc(doc(as('reader', false), 'lists', LIST))));
  test('unverified member can leave', () =>
    assertSucceeds(updateDoc(doc(as('reader', false), 'lists', LIST), new FieldPath('roles', 'reader@test.com'), deleteField(),
      'memberEmails', arrayRemove('reader@test.com'), 'leftEmails', arrayUnion('reader@test.com'))));
  test('"shared with me" query works', () =>
    assertSucceeds(getDocs(query(collection(as('reader'), 'lists'), where('memberEmails', 'array-contains', 'reader@test.com')))));
  test('"my lists" query works', () =>
    assertSucceeds(getDocs(query(collection(as('owner'), 'lists'), where('ownerId', '==', 'owner')))));
  test('owner shares with more people', () =>
    assertSucceeds(updateDoc(doc(as('owner'), 'lists', LIST), new FieldPath('roles', 'new@test.com'), 'comment',
      'memberEmails', arrayUnion('new@test.com'))));
  test('roles and memberEmails must match', () =>
    assertFails(updateDoc(doc(as('owner'), 'lists', LIST), new FieldPath('roles', 'new@test.com'), 'comment')));
  test('unknown permission rejected', () =>
    assertFails(updateDoc(doc(as('owner'), 'lists', LIST), new FieldPath('roles', 'new@test.com'), 'admin',
      'memberEmails', arrayUnion('new@test.com'))));
  test('owner changes access', () =>
    assertSucceeds(updateDoc(doc(as('owner'), 'lists', LIST), new FieldPath('roles', 'reader@test.com'), 'readwrite')));
  test('member cannot raise their own access', () =>
    assertFails(updateDoc(doc(as('reader'), 'lists', LIST), new FieldPath('roles', 'reader@test.com'), 'readwrite')));
  test('member cannot share with others', () =>
    assertFails(updateDoc(doc(as('rw'), 'lists', LIST), new FieldPath('roles', 'x@test.com'), 'read', 'memberEmails', arrayUnion('x@test.com'))));
  test('member cannot rename', () => assertFails(updateDoc(doc(as('rw'), 'lists', LIST), { title: 'Hacked' })));
  test('member can leave', () =>
    assertSucceeds(updateDoc(doc(as('reader'), 'lists', LIST), new FieldPath('roles', 'reader@test.com'), deleteField(),
      'memberEmails', arrayRemove('reader@test.com'), 'leftEmails', arrayUnion('reader@test.com'))));
  test('member cannot remove someone else', () =>
    assertFails(updateDoc(doc(as('reader'), 'lists', LIST), new FieldPath('roles', 'rw@test.com'), deleteField(),
      'memberEmails', arrayRemove('rw@test.com'))));
  test('leaving must record that you left', () =>
    assertFails(updateDoc(doc(as('reader'), 'lists', LIST), new FieldPath('roles', 'reader@test.com'), deleteField(),
      'memberEmails', arrayRemove('reader@test.com'))));
  test('cannot mark someone else as having left', () =>
    assertFails(updateDoc(doc(as('reader'), 'lists', LIST), new FieldPath('roles', 'reader@test.com'), deleteField(),
      'memberEmails', arrayRemove('reader@test.com'), 'leftEmails', arrayUnion('reader@test.com', 'rw@test.com'))));
  test('owner shares again with someone who left, or clears them', async () => {
    await assertSucceeds(updateDoc(doc(as('reader'), 'lists', LIST), new FieldPath('roles', 'reader@test.com'), deleteField(),
      'memberEmails', arrayRemove('reader@test.com'), 'leftEmails', arrayUnion('reader@test.com')));
    // still listed as left while having access again is rejected
    await assertFails(updateDoc(doc(as('owner'), 'lists', LIST), new FieldPath('roles', 'reader@test.com'), 'read',
      'memberEmails', arrayUnion('reader@test.com')));
    await assertSucceeds(updateDoc(doc(as('owner'), 'lists', LIST), 'leftEmails', arrayRemove('reader@test.com')));
  });
  test('owner can archive and unarchive', async () => {
    await assertSucceeds(updateDoc(doc(as('owner'), 'lists', LIST), { archived: true }));
    await assertSucceeds(updateDoc(doc(as('owner'), 'lists', LIST), { archived: false }));
  });
  test('members cannot archive', () => assertFails(updateDoc(doc(as('rw'), 'lists', LIST), { archived: true })));
  test('archived must be true or false', () => assertFails(updateDoc(doc(as('owner'), 'lists', LIST), { archived: 'yes' })));
  test('only owner can delete the list', async () => {
    await assertFails(deleteDoc(doc(as('rw'), 'lists', LIST)));
    await assertSucceeds(deleteDoc(doc(as('owner'), 'lists', LIST)));
  });
});

describe('tasks', () => {
  for (const who of ['owner', 'reader', 'commenter', 'writer', 'rw']) {
    test(`${who} can read tasks`, () => assertSucceeds(getDocs(collection(as(who), 'lists', LIST, 'tasks'))));
  }
  test('stranger cannot read tasks', () => assertFails(getDocs(collection(as('stranger'), 'lists', LIST, 'tasks'))));

  for (const who of ['reader', 'commenter', 'stranger']) {
    test(`${who} cannot add, edit, complete, archive or delete`, async () => {
      const db = as(who);
      await assertFails(addDoc(collection(db, 'lists', LIST, 'tasks'), task(people[who].uid)));
      await assertFails(updateDoc(doc(db, 'lists', LIST, 'tasks', 't1'), { text: 'x', ...stamp(people[who].uid) }));
      await assertFails(updateDoc(doc(db, 'lists', LIST, 'tasks', 't1'), { done: true, ...stamp(people[who].uid) }));
      await assertFails(updateDoc(doc(db, 'lists', LIST, 'tasks', 't1'), { archived: true, ...stamp(people[who].uid) }));
      await assertFails(deleteDoc(doc(db, 'lists', LIST, 'tasks', 't1')));
    });
  }
  for (const who of ['owner', 'writer', 'rw']) {
    test(`${who} can add (with list timestamp), edit, complete, archive and delete`, async () => {
      const db = as(who);
      const uid = people[who].uid;
      const b = writeBatch(db);
      const ref = doc(collection(db, 'lists', LIST, 'tasks'));
      b.set(ref, task(uid));
      b.update(doc(db, 'lists', LIST), { updatedAt: serverTimestamp() });
      await assertSucceeds(b.commit());
      await assertSucceeds(updateDoc(doc(db, 'lists', LIST, 'tasks', 't1'), { text: 'edited', ...stamp(uid) }));
      await assertSucceeds(updateDoc(doc(db, 'lists', LIST, 'tasks', 't1'), { done: true, ...stamp(uid) }));
      await assertSucceeds(updateDoc(doc(db, 'lists', LIST, 'tasks', 't1'), { archived: true, ...stamp(uid) }));
      await assertSucceeds(deleteDoc(ref));
    });
  }
  test('cannot fake who created a task', () =>
    assertFails(addDoc(collection(as('writer'), 'lists', LIST, 'tasks'), task('owner'))));
  test('cannot add unexpected fields', () =>
    assertFails(addDoc(collection(as('writer'), 'lists', LIST, 'tasks'), task('writer', { hacked: true }))));
  test('can give a task a due date', () =>
    assertSucceeds(addDoc(collection(as('writer'), 'lists', LIST, 'tasks'), task('writer', { due: '2026-10-27' }))));
  test('can clear a due date', () =>
    assertSucceeds(addDoc(collection(as('writer'), 'lists', LIST, 'tasks'), task('writer', { due: null }))));
  test('can give a task a time', () =>
    assertSucceeds(addDoc(collection(as('writer'), 'lists', LIST, 'tasks'), task('writer', { due: '2026-10-27', start: '10:00', mins: 90 }))));
  test('time must be HH:MM', () =>
    assertFails(addDoc(collection(as('writer'), 'lists', LIST, 'tasks'), task('writer', { due: '2026-10-27', start: '25:00', mins: 60 }))));
  test('length must be 5 minutes to a day', () =>
    assertFails(addDoc(collection(as('writer'), 'lists', LIST, 'tasks'), task('writer', { due: '2026-10-27', start: '10:00', mins: 5000 }))));
  test('can add notes to a task', () =>
    assertSucceeds(addDoc(collection(as('writer'), 'lists', LIST, 'tasks'), task('writer', { notes: 'Call ahead first' }))));
  test('notes must be text of at most 2000 characters', () =>
    assertFails(addDoc(collection(as('writer'), 'lists', LIST, 'tasks'), task('writer', { notes: 'x'.repeat(2001) }))));
  test('due date must be YYYY-MM-DD', () =>
    assertFails(addDoc(collection(as('writer'), 'lists', LIST, 'tasks'), task('writer', { due: 'next tuesday' }))));
});

describe('comments', () => {
  const c = (who) => ({ text: 'hi', userId: people[who].uid, userName: who, userEmail: people[who].email, createdAt: serverTimestamp() });
  for (const who of ['owner', 'commenter', 'rw']) {
    test(`${who} can read and post comments`, async () => {
      await assertSucceeds(getDocs(collection(as(who), 'lists', LIST, 'comments')));
      await assertSucceeds(addDoc(collection(as(who), 'lists', LIST, 'comments'), c(who)));
    });
  }
  for (const who of ['reader', 'writer', 'stranger']) {
    test(`${who} cannot read or post comments`, async () => {
      await assertFails(getDocs(collection(as(who), 'lists', LIST, 'comments')));
      await assertFails(addDoc(collection(as(who), 'lists', LIST, 'comments'), c(who)));
    });
  }
  test('cannot post as someone else', () =>
    assertFails(addDoc(collection(as('commenter'), 'lists', LIST, 'comments'), { ...c('commenter'), userId: 'owner' })));
  test('cannot delete someone else\'s comment', () => assertFails(deleteDoc(doc(as('rw'), 'lists', LIST, 'comments', 'c1'))));
  test('owner can delete any comment', () => assertSucceeds(deleteDoc(doc(as('owner'), 'lists', LIST, 'comments', 'c1'))));
});

describe('profiles and invitations', () => {
  test('save your own last opened list', () =>
    assertSucceeds(setDoc(doc(as('reader'), 'users', 'reader'), { lastListId: LIST, updatedAt: serverTimestamp() }, { merge: true })));
  test('save your own favourites', () =>
    assertSucceeds(setDoc(doc(as('reader'), 'users', 'reader'), { favorites: arrayUnion(LIST), updatedAt: serverTimestamp() }, { merge: true })));
  test('save your own list order', () =>
    assertSucceeds(setDoc(doc(as('reader'), 'users', 'reader'), { listOrder: [LIST, 'other'], updatedAt: serverTimestamp() }, { merge: true })));
  test('list order must be a list', () =>
    assertFails(setDoc(doc(as('reader'), 'users', 'reader'), { listOrder: 'nope' }, { merge: true })));
  test("cannot change someone else's favourites", () =>
    assertFails(setDoc(doc(as('reader'), 'users', 'owner'), { favorites: [LIST] }, { merge: true })));
  test('cannot read someone else\'s profile', () => assertFails(getDoc(doc(as('reader'), 'users', 'owner'))));
  test('owner can queue an invite to a member', () =>
    assertSucceeds(addDoc(collection(as('owner'), 'mail'), {
      to: 'reader@test.com', listId: LIST, createdBy: 'owner', message: { subject: 's', html: '<p>h</p>', text: 't' },
    })));
  test('cannot email someone who is not on the list', () =>
    assertFails(addDoc(collection(as('owner'), 'mail'), {
      to: 'stranger@test.com', listId: LIST, createdBy: 'owner', message: { subject: 's', html: 'h', text: 't' },
    })));
  test('owner shares and leaves a notification in one batch', () => {
    const db = as('owner');
    const b = writeBatch(db);
    b.update(doc(db, 'lists', LIST), new FieldPath('roles', 'new@test.com'), 'read', 'memberEmails', arrayUnion('new@test.com'));
    b.set(doc(db, 'invites', `${LIST}_new@test.com`), invite('new@test.com'));
    return assertSucceeds(b.commit());
  });
  test('cannot notify someone the list is not shared with', () =>
    assertFails(setDoc(doc(as('owner'), 'invites', `${LIST}_stranger@test.com`), invite('stranger@test.com'))));
  test('members cannot send notifications', () =>
    assertFails(setDoc(doc(as('rw'), 'invites', `${LIST}_reader@test.com`), { ...invite('reader@test.com'), fromEmail: 'rw@test.com' })));
  test('recipient reads, marks seen and dismisses their notification', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'invites', 'i1'), invite('reader@test.com')));
    const db = as('reader', false);
    await assertSucceeds(getDocs(query(collection(db, 'invites'), where('to', '==', 'reader@test.com'))));
    await assertSucceeds(updateDoc(doc(db, 'invites', 'i1'), { seen: true }));
    await assertSucceeds(updateDoc(doc(db, 'invites', 'i1'), { seen: false })); // mark as unread
    await assertFails(updateDoc(doc(db, 'invites', 'i1'), { seen: 'yes' }));
    await assertFails(updateDoc(doc(db, 'invites', 'i1'), { listTitle: 'Changed' }));
    await assertSucceeds(deleteDoc(doc(db, 'invites', 'i1')));
  });
  test("cannot read someone else's notifications", async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'invites', 'i1'), invite('reader@test.com')));
    await assertFails(getDoc(doc(as('rw'), 'invites', 'i1')));
  });
  test('leaving clears your notification in the same batch', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'invites', 'i1'), invite('reader@test.com')));
    const db = as('reader');
    const b = writeBatch(db);
    b.update(doc(db, 'lists', LIST), new FieldPath('roles', 'reader@test.com'), deleteField(), 'memberEmails', arrayRemove('reader@test.com'), 'leftEmails', arrayUnion('reader@test.com'));
    b.delete(doc(db, 'invites', 'i1'));
    await assertSucceeds(b.commit());
  });
  test('members cannot send invitation emails', () =>
    assertFails(addDoc(collection(as('rw'), 'mail'), {
      to: 'reader@test.com', listId: LIST, createdBy: 'rw', message: { subject: 's', html: 'h', text: 't' },
    })));
});
