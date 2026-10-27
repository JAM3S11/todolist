'use client';
import { useState } from 'react';
import { timeAgo } from '@/lib/people';
import DuePicker from './DuePicker';

export default function TaskItem({ task, write, me, onToggle, onEdit, onDue, onArchive, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(task.text);
  const [confirm, setConfirm] = useState(false);
  const [more, setMore] = useState(false); // phones: the actions open under the task from the ⋯ button

  function save() {
    const v = text.trim();
    setEditing(false);
    if (v && v !== task.text) onEdit(v);
    else setText(task.text);
  }

  const by = task.createdBy === me ? 'you' : (task.createdByName || 'someone').split(/[\s@]/)[0];
  const edited =
    task.updatedBy && task.updatedBy !== task.createdBy
      ? ` · last changed by ${task.updatedBy === me ? 'you' : task.updatedByName || 'someone'}`
      : '';

  return (
    <li className={['task', task.done && 'done', (more || confirm) && 'acts-open'].filter(Boolean).join(' ')}>
      <input type="checkbox" checked={task.done} disabled={!write} onChange={onToggle} aria-label="Mark complete" />
      <div className="t">
        {editing ? (
          <input
            id={`edit-${task.id}`}
            autoFocus
            maxLength={500}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') { setText(task.text); setEditing(false); }
            }}
          />
        ) : (
          task.text
        )}
        {task.notes && !editing && <p className="task-notes">{task.notes}</p>}
      </div>
      <DuePicker value={task.due || null} task={task} canEdit={write && !task.archived} onChange={onDue} time={task.start || null} />
      <span className="by" title={`Updated ${timeAgo(task.updatedAt)}${edited}`}>{by}</span>
      {write && (
        <button className="task-more" type="button" onClick={() => { setMore((m) => !m); setConfirm(false); }}
          aria-expanded={more} aria-label={more ? 'Hide task actions' : 'Task actions'}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
        </button>
      )}
      {write && (
        <div className="acts">
          {confirm ? (
            <>
              <button className="ic del" type="button" onClick={onDelete}>Confirm delete</button>
              <button className="ic" type="button" onClick={() => setConfirm(false)}>Cancel</button>
            </>
          ) : (
            <>
              {!editing && <button className="ic" type="button" onClick={() => { setText(task.text); setEditing(true); setMore(false); }}>Edit</button>}
              <button className="ic" type="button" onClick={() => { setMore(false); onArchive(); }}>{task.archived ? 'Restore' : 'Archive'}</button>
              <button className="ic del" type="button" onClick={() => setConfirm(true)}>Delete</button>
            </>
          )}
        </div>
      )}
    </li>
  );
}
