'use client';
import { useEffect, useRef } from 'react';
import { friendlyError } from '@/lib/firebase';
import { addComment, deleteComment } from '@/lib/data';
import { Avatar, timeAgo } from '@/lib/people';
import { useDraft } from '@/lib/useDraft';
import { useToast } from './Toast';

export default function Comments({ listId, comments, user, isOwner, hint }) {
  const toast = useToast();
  const [text, setText] = useDraft(`draft:comment:${listId}`);
  const threadRef = useRef(null);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [comments.length]);

  function send(e) {
    e?.preventDefault();
    const v = text.trim();
    if (!v) return;
    setText('');
    addComment(listId, user, v).catch((err) => {
      setText(v);
      toast(`Comment not sent: ${friendlyError(err)}`, 'err');
    });
  }

  function remove(c) {
    deleteComment(listId, c.id).catch((err) => toast(friendlyError(err), 'err'));
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
                  {(mine || isOwner) && (
                    <button className="ic tiny" type="button" onClick={() => remove(c)} aria-label="Delete comment">Delete</button>
                  )}
                </div>
                <div className="tx">{c.text}</div>
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
