'use client';
import { useEffect, useState } from 'react';
import { roleLabel } from '@/lib/permissions';
import { Avatar, displayName } from '@/lib/people';

// One small dialog at a time, opened from a list's ⋮ menu
export default function ListDialog({ dialog, contacts, onCreate, onRename, onDelete, onLeave, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const { kind, list } = dialog;
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal small-modal" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
        {kind === 'create' && <Create onCreate={onCreate} onClose={onClose} />}
        {kind === 'rename' && <Rename list={list} onSave={(t) => { onRename(list, t); onClose(); }} onClose={onClose} />}
        {kind === 'members' && <Members list={list} contacts={contacts} onClose={onClose} />}
        {kind === 'delete' && (
          <Confirm title={`Delete “${list.title}”?`} danger="Delete list" onClose={onClose} onYes={() => { onDelete(list); onClose(); }}>
            This deletes the list and all its tasks and comments for everyone it&apos;s shared with. It can&apos;t be undone.
            Archive it instead if you just want it out of the way.
          </Confirm>
        )}
        {kind === 'leave' && (
          <Confirm title={`Leave “${list.title}”?`} danger="Leave" onClose={onClose} onYes={() => { onLeave(list); onClose(); }}>
            You&apos;ll lose access. The owner has to share it with you again to get back in.
          </Confirm>
        )}
      </div>
    </div>
  );
}

function Head({ title, onClose }) {
  return (
    <div className="m-h">
      <h2 id="dlg-title">{title}</h2>
      <button className="ic" type="button" onClick={onClose} aria-label="Close">✕</button>
    </div>
  );
}

// onCreate resolves once the list exists; the dialog stays open (and shows why) if it fails
function Create({ onCreate, onClose }) {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const t = title.trim();

  async function submit(e) {
    e.preventDefault();
    if (!t) return setErr('Give the list a name first.');
    setBusy(true);
    setErr('');
    const problem = await onCreate(t);
    if (problem) {
      setErr(problem);
      setBusy(false);
    } else onClose();
  }

  return (
    <form onSubmit={submit}>
      <Head title="New list" onClose={onClose} />
      <div className="m-b">
        <div>
          <label className="sec-l" htmlFor="create-input">List name</label>
          <input id="create-input" autoFocus maxLength={120} value={title} placeholder="e.g. Groceries, Moving house"
            onChange={(e) => { setTitle(e.target.value); setErr(''); }} />
          {err && <div className="err">{err}</div>}
        </div>
        <p className="muted small">You&apos;ll be taken straight to it so you can add tasks and share it.</p>
      </div>
      <div className="m-f end">
        <button className="btn" type="button" onClick={onClose}>Cancel</button>
        <button className="btn primary" type="submit" disabled={busy || !t}>{busy ? 'Creating…' : 'Create list'}</button>
      </div>
    </form>
  );
}

function Rename({ list, onSave, onClose }) {
  const [title, setTitle] = useState(list.title);
  const t = title.trim();
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (t && t !== list.title) onSave(t); else onClose(); }}>
      <Head title="Edit list name" onClose={onClose} />
      <div className="m-b">
        <input id="rename-input" autoFocus maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="m-f end">
        <button className="btn" type="button" onClick={onClose}>Cancel</button>
        <button className="btn primary" type="submit" disabled={!t}>Save</button>
      </div>
    </form>
  );
}

function Members({ list, contacts, onClose }) {
  const named = Object.fromEntries(contacts.map((c) => [c.email, c]));
  const members = Object.entries(list.roles || {}).sort(([a], [b]) => a.localeCompare(b));
  const left = list.role === 'owner' ? list.leftEmails || [] : [];
  const row = (person, right, key) => (
    <div className="arow" key={key}>
      <Avatar person={person} size={28} />
      <span className="nm" title={person.email}>
        {displayName(person)}
        {person.displayName && <span className="em sub">{person.email}</span>}
      </span>
      {right}
    </div>
  );
  return (
    <>
      <Head title={`Who can access “${list.title}”`} onClose={onClose} />
      <div className="m-b">
        <div className="access">
          {row({ email: list.ownerEmail, displayName: list.ownerName }, <span className="pill owner">Owner</span>, 'owner')}
          {members.map(([email, role]) =>
            row(named[email] || { email }, <span className={`pill ${role}`}>{roleLabel(role)}</span>, email))}
        </div>
        {members.length === 0 && <div className="muted small">Not shared with anyone yet.</div>}
        {left.length > 0 && (
          <div>
            <span className="sec-l">Left the list</span>
            <div className="access">
              {left.map((email) => row(named[email] || { email }, <span className="muted small">No access</span>, email))}
            </div>
          </div>
        )}
      </div>
      <div className="m-f end">
        <button className="btn" type="button" onClick={onClose}>Close</button>
      </div>
    </>
  );
}

function Confirm({ title, danger, children, onYes, onClose }) {
  return (
    <>
      <Head title={title} onClose={onClose} />
      <div className="m-b"><p className="muted">{children}</p></div>
      <div className="m-f end">
        <button className="btn" type="button" onClick={onClose}>Cancel</button>
        <button className="btn danger" type="button" onClick={onYes} autoFocus>{danger}</button>
      </div>
    </>
  );
}
