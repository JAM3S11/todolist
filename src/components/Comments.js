'use client';
import { useEffect, useRef, useState } from 'react';
import { friendlyError } from '@/lib/firebase';
import { addComment, deleteComment, editComment, emailOf } from '@/lib/data';
import { Avatar, timeAgo, toDate } from '@/lib/people';
import { useDraft } from '@/lib/useDraft';
import { useToast } from './Toast';

export default function Comments({ list, comments, user, isOwner, hint }) {
  const listId = list.id;
  const toast = useToast();
  const [text, setText] = useDraft(`draft:comment:${listId}`);
  const threadRef = useRef(null);
  const [editing, setEditing] = useState(null); // the id of my comment being edited (one at a time)
  const [draft, setDraft] = useState('');

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [comments.length]);

  // Once the server has it, tell me who was notified (the same people notify() in lib/data.js writes to)
  function whoHears() {
    const me = emailOf(user);
    const roles = list.roles || {};
    const names = [
      ...(list.ownerEmail && list.ownerEmail !== me ? [list.ownerName || list.ownerEmail.split('@')[0]] : []),
      ...Object.keys(roles).filter((e) => e !== me && (roles[e] === 'comment' || roles[e] === 'readwrite')).map((e) => e.split('@')[0]),
    ];
    if (!names.length) return 'only you can see it';
    if (names.length <= 2) return `${names.join(' and ')} notified`;
    return `${names.length} people notified`;
  }

  function send(e) {
    e?.preventDefault();
    const v = text.trim();
    if (!v) return;
    setText('');
    addComment(list, user, v)
      .then(() => toast(`Comment sent · ${whoHears()}`))
      .catch((err) => {
        setText(v);
        toast(`Comment not sent: ${friendlyError(err)}`, 'err');
      });
  }

  function startEdit(c) {
    setEditing(c.id);
    setDraft(c.text);
  }

  // Unchanged or emptied: just close (Delete is how a comment goes away). If it's refused, reopen with my words.
  function saveEdit(c) {
    const v = draft.trim();
    setEditing(null);
    if (!v || v === c.text) return;
    editComment(list, c.id, user, v)
      .then(() => toast(`Comment updated · ${whoHears()}`))
      .catch((err) => {
        setEditing(c.id);
        setDraft(v);
        toast(`Comment not saved: ${friendlyError(err)}`, 'err');
      });
  }

  function remove(c) {
    deleteComment(list, c, user)
      .then(() => toast('Comment deleted'))
      .catch((err) => toast(friendlyError(err), 'err'));
  }

  return (
    <aside className="panel comments">
      <div className="panel-h">
        <h2>Comments</h2>
        <span className="count">{comments.length}</span>
      </div>
      {hint && <div className="hint">{hint}</div>}
      <div className="thread" ref={threadRef}>
        {comments.length === 0 && <div className="muted small">No comments yet. Start the conversation.</div>}
        {comments.map((c) => {
          const mine = c.userId === user.uid;
          return (
            <div className="c" key={c.id}>
              <Avatar person={{ email: c.userEmail, displayName: c.userName }} size={26} />
              <div className="bubble">
                <div className="nm">
                  {mine ? 'You' : c.userName || c.userEmail}
                  <span className="tm">{timeAgo(c.createdAt)}</span>
                  {c.editedAt && (
                    <span className="tm c-edited" title={`Edited ${toDate(c.editedAt).toLocaleString()}`}>· edited</span>
                  )}
                  {mine && editing !== c.id && (
                    <button className="ic tiny" type="button" onClick={() => startEdit(c)} aria-label="Edit comment">Edit</button>
                  )}
                  {(mine || isOwner) && (
                    <button className="ic tiny" type="button" onClick={() => remove(c)} aria-label="Delete comment">Delete</button>
                  )}
                </div>
                {editing === c.id ? (
                  <div className="c-edit">
                    <textarea
                      autoFocus
                      value={draft}
                      maxLength={2000}
                      aria-label="Edit your comment"
                      onFocus={(e) => e.target.setSelectionRange(e.target.value.length, e.target.value.length)}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(c); }
                        if (e.key === 'Escape') { e.stopPropagation(); setEditing(null); } // close just the editor, not the panel it's in
                      }}
                    />
                    <div className="c-edit-b">
                      <button className="btn primary" type="button" onClick={() => saveEdit(c)}>Save</button>
                      <button className="btn" type="button" onClick={() => setEditing(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="tx">{c.text}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <form className="c-form" onSubmit={send}>
        <textarea
          id="comment-text"
          value={text}
          maxLength={2000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Write a comment…"
        />
        <button className="btn primary" type="submit">Send</button>
      </form>
    </aside>
  );
}
