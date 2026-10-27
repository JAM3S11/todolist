'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { friendlyError } from '@/lib/firebase';
import {
  addTask,
  deleteTask,
  renameList,
  updateTask,
  watchComments,
  watchTasks,
} from '@/lib/data';
import { PERMISSIONS, canComment, canWrite, roleLabel } from '@/lib/permissions';
import { Avatar } from '@/lib/people';
import { useDraft } from '@/lib/useDraft';
import { dueLabel } from '@/lib/dates';
import { useToast } from './Toast';
import DuePicker from './DuePicker';
import TaskItem from './TaskItem';
import Comments from './Comments';
import ShareModal from './ShareModal';
import Loading from './Loading';

export default function ListView({ list, role, user, contacts, onLeave, onDelete, onArchive, menu }) {
  const toast = useToast();
  const write = canWrite(role);
  const comment = canComment(role);
  const isOwner = role === 'owner';

  const [tasks, setTasks] = useState(null);
  const [comments, setComments] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [pane, setPane] = useState('tasks'); // phones show Tasks or Comments, one at a time
  const [shareOpen, setShareOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(list.title);
  const [newTask, setNewTask] = useDraft(`draft:task:${list.id}`);
  const [newDue, setNewDue] = useState(null);

  useEffect(() => setTitle(list.title), [list.title]);

  // People with access come straight from the list document, so they update live
  const members = useMemo(
    () => Object.entries(list.roles || {}).map(([email, permission]) => ({ email, permission })).sort((a, b) => a.email.localeCompare(b.email)),
    [list.roles],
  );

  // ---- tell the owner when someone leaves while they're looking at the list
  const left = useMemo(() => list.leftEmails || [], [list.leftEmails]);
  const prevLeft = useRef(left);
  useEffect(() => {
    if (isOwner) left.filter((e) => !prevLeft.current.includes(e)).forEach((e) => toast(`${e} left “${list.title}”`));
    prevLeft.current = left;
  }, [left, isOwner, list.title, toast]);

  // ---- live tasks
  useEffect(
    () => watchTasks(list.id, setTasks, (e) => { setTasks([]); toast(friendlyError(e), 'err'); }),
    [list.id, toast],
  );

  // ---- live comments, only for roles that can see them
  useEffect(() => {
    if (!comment) return setComments([]);
    return watchComments(list.id, setComments, () => setComments([]));
  }, [list.id, comment]);

  // Firestore shows changes on screen immediately and syncs them in the background.
  // If the database refuses a change, it's undone automatically and we show why.
  const run = (promise, okMsg) =>
    promise.then(() => okMsg && toast(okMsg)).catch((e) => toast(`Not saved: ${friendlyError(e)}`, 'err'));

  function onAdd(e) {
    e.preventDefault();
    const text = newTask.trim();
    if (!text) return;
    const due = newDue;
    setNewTask('');
    setNewDue(null);
    addTask(list.id, user, text, due).catch((err) => {
      setNewTask(text);
      setNewDue(due);
      toast(`Not saved: ${friendlyError(err)}`, 'err');
    });
  }

  async function saveTitle(e) {
    e?.preventDefault();
    const t = title.trim();
    setRenaming(false);
    if (!t || t === list.title) return setTitle(list.title);
    run(renameList(list.id, t));
  }

  const ownerPerson = { email: list.ownerEmail, displayName: list.ownerName };
  const active = (tasks || []).filter((t) => !t.archived);
  const archived = (tasks || []).filter((t) => t.archived);
  const someoneCanComment = members.some((m) => canComment(m.permission));
  const everyone = [ownerPerson, ...members.map((m) => ({ email: m.email }))];

  const taskProps = (t) => ({
    task: t,
    write,
    me: user.uid,
    onToggle: () => run(updateTask(list.id, t.id, user, { done: !t.done })),
    onEdit: (text) => run(updateTask(list.id, t.id, user, { text })),
    // removing the date also removes its time
    onDue: (due) => run(updateTask(list.id, t.id, user, due ? { due } : { due: null, start: null, mins: null }),
      due ? `Due ${dueLabel(due).toLowerCase()}` : 'Due date removed'),
    onArchive: () => run(updateTask(list.id, t.id, user, { archived: !t.archived }), t.archived ? 'Task restored' : 'Task archived'),
    onDelete: () => run(deleteTask(list.id, t.id), 'Task deleted'),
  });

  return (
    <div className="list-wrap">
      <header className="bar lv-bar">
        <div className="bar-left">
          {renaming ? (
            <form onSubmit={saveTitle} className="rename">
              <input id="list-title" autoFocus maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} />
            </form>
          ) : (
            <h1 onDoubleClick={() => isOwner && setRenaming(true)} title={isOwner ? 'Double-click to rename' : undefined}>{list.title}</h1>
          )}
          <div className="meta">
            {isOwner ? 'Owned by you' : `Owned by ${list.ownerName || list.ownerEmail}`} ·{' '}
            {members.length ? `shared with ${members.length} ${members.length === 1 ? 'person' : 'people'}` : 'not shared yet'}
            {isOwner && left.length > 0 && ` · ${left.length} left`}
          </div>
        </div>
        <div className="bar-right">
          <div className="avatars" title={`${everyone.length} ${everyone.length === 1 ? 'person' : 'people'} with access`}>
            {everyone.slice(0, 6).map((p) => <Avatar key={p.email} person={p} size={30} />)}
            {everyone.length > 6 && <span className="av av-more">+{everyone.length - 6}</span>}
          </div>
          {isOwner ? (
            <>
              {/* on phones Rename lives in the ⋮ menu ("Edit name") */}
              <button className="btn lv-rename" type="button" onClick={() => setRenaming(true)}>Rename</button>
              <button className="btn primary" type="button" onClick={() => setShareOpen(true)}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6" /></svg>
                Share
              </button>
            </>
          ) : (
            <button className="btn" type="button" onClick={() => onLeave(list)}>Leave list</button>
          )}
          {menu}
        </div>
      </header>

      {list.archived && (
        <div className="banner archived-banner">
          <span>This list is archived. It&apos;s kept with everything in it, just out of the way.</span>
          {isOwner && <button className="btn" type="button" onClick={() => onArchive(list)}>Unarchive</button>}
        </div>
      )}

      {!isOwner && (
        <div className="banner">
          You have <b>{roleLabel(role)}</b> access. {PERMISSIONS[role]?.desc}
        </div>
      )}

      {/* phones: Tasks and Comments as two tabs instead of one long page */}
      {comment && (
        <div className="seg lv-tabs" role="tablist" aria-label="List sections">
          <button type="button" role="tab" aria-selected={pane === 'tasks'} className={pane === 'tasks' ? 'on' : ''} onClick={() => setPane('tasks')}>
            Tasks <span>{tasks ? `${active.filter((t) => t.done).length}/${active.length}` : '…'}</span>
          </button>
          <button type="button" role="tab" aria-selected={pane === 'comments'} className={pane === 'comments' ? 'on' : ''} onClick={() => setPane('comments')}>
            Comments <span>{comments.length}</span>
          </button>
        </div>
      )}

      <div className={`${comment ? 'grid' : 'grid solo'} show-${pane}`}>
        <section className="panel lv-tasks">
          <div className="panel-h">
            <h2>Tasks</h2>
            <span className="count">{tasks ? `${active.filter((t) => t.done).length}/${active.length} done` : ''}</span>
          </div>

          {write && (
            <form className="add" onSubmit={onAdd}>
              <input id="new-task" value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="Add a task" autoComplete="off" maxLength={500}
                enterKeyHint="done" />
              <DuePicker value={newDue} onChange={setNewDue} compact />
              <button className="btn primary" type="submit" aria-label="Add task">
                <svg className="add-plus" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                <span className="add-l">Add</span>
              </button>
            </form>
          )}

          <ul className="tasks">
            {tasks === null && <li className="empty"><Loading hint="Getting your tasks" /></li>}
            {tasks && active.length === 0 && <li className="empty">No open tasks.{write ? ' Add one above.' : ''}</li>}
            {active.map((t) => <TaskItem key={t.id} {...taskProps(t)} />)}
          </ul>

          <button className="arch-toggle" type="button" onClick={() => setShowArchived((s) => !s)} aria-expanded={showArchived}>
            {showArchived ? '▾' : '▸'} Archived ({archived.length})
          </button>
          {showArchived && (
            <ul className="tasks">
              {archived.length === 0 && <li className="empty">Nothing archived.</li>}
              {archived.map((t) => <TaskItem key={t.id} {...taskProps(t)} />)}
            </ul>
          )}
        </section>

        {comment && (
          <Comments
            listId={list.id}
            comments={comments}
            user={user}
            isOwner={isOwner}
            hint={isOwner && !someoneCanComment ? 'Only you can see this thread until you share with Comment only or Read & write access.' : null}
          />
        )}
      </div>

      {isOwner && (
        <div className="danger-zone">
          <button className="ic del" type="button" onClick={() => onDelete(list)}>Delete this list…</button>
        </div>
      )}

      {shareOpen && (
        <ShareModal list={list} members={members} contacts={contacts} user={user} onClose={() => setShareOpen(false)} />
      )}
    </div>
  );
}
