'use client';
import { useState } from 'react';
import { friendlyError } from '@/lib/firebase';
import { addTask } from '@/lib/data';
import { DEFAULT_MINS } from '@/lib/dates';
import { normalizeUrl } from '@/lib/links';
import { useDraft } from '@/lib/useDraft';
import { useToast } from './Toast';
import DuePicker from './DuePicker';
import { MAX_LOCATION, PinIcon, TimeFields } from './TaskDetails';

const EMPTY = { notes: '', location: '', link: '', start: null, mins: DEFAULT_MINS };

// "Add a task": once something is typed, the optional extras slide open under it:
// what's going to be done, where, a link, and (with a date) a time. Enter adds it from any one-line box.
export default function AddTask({ list, user }) {
  const toast = useToast();
  const [text, setText] = useDraft(`draft:task:${list.id}`);
  const [due, setDue] = useState(null);
  const [more, setMore] = useState(EMPTY);
  const [linkErr, setLinkErr] = useState('');
  const open = text.trim().length > 0;
  const set = (k) => (e) => setMore((m) => ({ ...m, [k]: e.target.value }));

  function submit(e) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    const url = more.link.trim() ? normalizeUrl(more.link) : null;
    if (more.link.trim() && !url) return setLinkErr('Enter a web address, like example.com — or leave it empty');
    const kept = { text, due, more };
    const time = due && more.start ? { start: more.start, mins: more.mins } : null;
    setText(''); setDue(null); setMore(EMPTY); setLinkErr('');
    addTask(list, user, t, due, more.notes.trim(), time, {
      location: more.location.trim(),
      links: url ? [{ url, title: '' }] : [],
    }).catch((err) => {
      setText(kept.text); setDue(kept.due); setMore(kept.more);
      toast(`Not saved: ${friendlyError(err)}`, 'err');
    });
  }

  return (
    <form className={open ? 'add-form open' : 'add-form'} onSubmit={submit}>
      <div className="add">
        <input id="new-task" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a task" autoComplete="off" maxLength={500}
          enterKeyHint="done" aria-expanded={open} aria-controls="add-more" />
        <DuePicker value={due} onChange={setDue} compact />
        <button className="btn primary" type="submit" aria-label="Add task">
          <svg className="add-plus" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          <span className="add-l">Add</span>
        </button>
      </div>

      {/* slides open once there's a task to add; hidden fields can't be tabbed into */}
      <div className="add-more" id="add-more" inert={!open}>
        <div className="add-more-in">
          <label className="field">
            <span>What&apos;s going to be done <span className="opt">optional</span></span>
            <textarea rows={2} maxLength={2000} value={more.notes} onChange={set('notes')} placeholder="Details, steps…" />
          </label>
          <div className="add-row">
            <label className="field">
              <span>Location <span className="opt">optional</span></span>
              <span className="td-loc-in">
                <PinIcon />
                <input maxLength={MAX_LOCATION} value={more.location} onChange={set('location')} autoComplete="off" placeholder="Where is it?" />
              </span>
            </label>
            <label className="field">
              <span>Link <span className="opt">optional</span></span>
              <input value={more.link} onChange={(e) => { setLinkErr(''); set('link')(e); }} autoComplete="off" inputMode="url" placeholder="example.com"
                aria-invalid={!!linkErr} />
            </label>
          </div>
          {linkErr && <p className="link-err">{linkErr}</p>}
          {due && (
            <div className="field">
              <span>Time <span className="opt">optional</span></span>
              <TimeFields start={more.start} mins={more.mins} idPrefix={`add-${list.id}`}
                onChange={({ start, mins }) => setMore((m) => ({ ...m, start, mins }))} />
            </div>
          )}
        </div>
      </div>
    </form>
  );
}
