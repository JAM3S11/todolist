// How a notification reads, in plain text. Shared by the bell / Notifications page (in the browser)
// and the push sender (/api/push, on the server), so both always say the same thing.
import { dueLabel } from './dates';
import { roleLabel } from './permissions';

const quote = (t) => `“${t}”`;
const dueText = (d) => { const [day, time] = d.split(' '); return `${dueLabel(day).toLowerCase()}${time ? ` at ${time}` : ''}`; };

// Activity on a list or letter: its tag, and what the person did (read as "<who> <did> “<list>”").
// text: the task or comment it's about; detail: the extra bit (old name, a date, someone's email, an access level).
// gone: still shown after the list is gone (that's what it's telling you)
export const ACT = {
  comment: { label: 'New comment', group: 'comments', did: () => 'commented on' },
  'comment-edit': { label: 'Comment edited', group: 'comments', did: () => 'edited a comment on' },
  'comment-delete': { label: 'Comment deleted', group: 'comments', did: () => 'deleted a comment on' },
  'task-add': { label: 'Task added', did: (n) => `added ${quote(n.text)}${n.detail ? `, due ${dueText(n.detail)},` : ''} to` },
  'task-edit': { label: 'Task changed', did: (n) => `renamed ${quote(n.detail)} to ${quote(n.text)} in` },
  'task-done': { label: 'Task done', did: (n) => `completed ${quote(n.text)} in` },
  'task-undone': { label: 'Task reopened', did: (n) => `reopened ${quote(n.text)} in` },
  'task-due': { label: 'Date changed', did: (n) => (n.detail ? `set ${quote(n.text)} for ${dueText(n.detail)} in` : `removed the date from ${quote(n.text)} in`) },
  'task-notes': { label: 'Notes changed', did: (n) => `updated the notes on ${quote(n.text)} in` },
  'task-archive': { label: 'Task archived', did: (n) => `archived ${quote(n.text)} in` },
  'task-restore': { label: 'Task restored', did: (n) => `restored ${quote(n.text)} in` },
  'task-delete': { label: 'Task deleted', did: (n) => `deleted ${quote(n.text)} from` },
  'task-link': { label: 'Link added', did: (n) => `added a link to ${quote(n.text)} in` },
  'task-unlink': { label: 'Link removed', did: (n) => `removed a link from ${quote(n.text)} in` },
  'letter-edit': { label: 'Letter edited', did: () => 'wrote in' },
  'list-rename': { label: 'Renamed', did: (n) => `renamed ${quote(n.detail)} to` },
  'list-archive': { label: 'Archived', did: () => 'archived' },
  'list-unarchive': { label: 'Unarchived', did: () => 'unarchived' },
  'list-delete': { label: 'Deleted', gone: true, did: () => 'deleted' },
  'member-added': { label: 'New member', did: (n) => `gave ${n.detail} access to` },
  'member-removed': { label: 'Member removed', did: (n) => `removed ${n.detail} from` },
  'access-changed': { label: 'Your access', did: (n) => `changed your access to ${roleLabel(n.detail).toLowerCase()} on` },
  'access-removed': { label: 'Access removed', gone: true, did: () => 'removed you from' },
  'member-left': { label: 'Member left', did: () => 'left' },
};

export const isComment = (n) => ACT[n.kind]?.group === 'comments';
export const who = (n) => n.from.displayName || n.from.email;
export const where = (n) => (n.letter ? `the love letter “${n.listTitle}”` : `“${n.listTitle}”`);
const short = (t) => (t.length > 60 ? `${t.slice(0, 60)}…` : t);

// One line: "Amani completed “Pack boxes” in “Moving house”"
export function toastText(n) {
  if (n.kind === 'share') return `${who(n)} ${n.letter ? 'sent you a love letter' : `shared “${n.listTitle}” with you`}`;
  return `${who(n)} ${ACT[n.kind].did(n)} ${where(n)}${n.kind === 'comment' && n.text ? `: “${short(n.text)}”` : ''}`;
}

// A device notification: the list as the title, what happened as the body.
// doc: an activity/{id} or invites/{id} document as stored in Firestore.
export function pushMessage(doc, kind = doc.kind || 'share') {
  const n = {
    kind, listTitle: doc.listTitle, letter: !!doc.letter, text: doc.text || '', detail: doc.detail || '',
    from: { email: doc.fromEmail, displayName: doc.fromName },
  };
  if (kind !== 'share' && !ACT[kind]) return null;
  const title = n.letter ? `Love letter · ${n.listTitle}` : n.listTitle;
  if (kind === 'share') return { title, body: toastText(n) };
  // the list is already the title, so "completed “Pack boxes” in" reads as "completed “Pack boxes”"
  const did = ACT[kind].did(n).replace(/ (to|in|on|from)$/, '');
  return { title, body: `${who(n)} ${did}${kind === 'comment' && n.text ? `: “${short(n.text)}”` : ''}` };
}
