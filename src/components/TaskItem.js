'use client';
import { useState } from 'react';
import { timeAgo } from '@/lib/people';
import DuePicker from './DuePicker';

export default function TaskItem({ task, write, me, onToggle, onEdit, onDue, onArchive, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(task.text);
  const [confirm, setConfirm] = useState(false);

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
    <li className={task.done ? 'task done' : 'task'}>
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
        <div className="acts">
          {confirm ? (
            <>
              <button className="ic del" type="button" onClick={onDelete}>Confirm delete</button>
              <button className="ic" type="button" onClick={() => setConfirm(false)}>Cancel</button>
            </>
          ) : (
            <>
              {!editing && <button className="ic" type="button" onClick={() => { setText(task.text); setEditing(true); }}>Edit</button>}
              <button className="ic" type="button" onClick={onArchive}>{task.archived ? 'Restore' : 'Archive'}</button>
              <button className="ic del" type="button" onClick={() => setConfirm(true)}>Delete</button>
            </>
          )}
        </div>
      )}
    </li>
  );
}
