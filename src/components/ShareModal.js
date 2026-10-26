'use client';
import { useEffect, useMemo, useState } from 'react';
import { friendlyError, inviteEmailsEnabled } from '@/lib/firebase';
import { changeAccess, clearLeft, emailOf, queueInviteEmails, removeAccess, shareList } from '@/lib/data';
import { appUrl } from '@/lib/appUrl';
import { EMAIL_RE, PERMISSIONS } from '@/lib/permissions';
import { Avatar, displayName } from '@/lib/people';
import { useToast } from './Toast';

// Opens the sharer's own email app with the invitation filled in
const mailtoFor = (to, title, link) =>
  `mailto:${to.join(',')}?subject=${encodeURIComponent(`I shared “${title}” with you`)}&body=${encodeURIComponent(
    `I shared the to-do list “${title}” with you.\n\nOpen it here: ${link}\n\nSign in or create an account with this email address to see it.`,
  )}`;

export default function ShareModal({ list, members, contacts, user, onClose }) {
  const toast = useToast();
  const myEmail = emailOf(user);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState(new Set());
  const [emails, setEmails] = useState([]);
  const [emailInput, setEmailInput] = useState('');
  const [emailErr, setEmailErr] = useState('');
  const [perm, setPerm] = useState('read');
  const [busy, setBusy] = useState(false);
  const [justShared, setJustShared] = useState([]);

  const memberEmails = useMemo(() => new Set(members.map((m) => m.email)), [members]);
  const left = useMemo(() => [...(list.leftEmails || [])].sort(), [list.leftEmails]);
  const nameByEmail = useMemo(() => Object.fromEntries(contacts.map((c) => [c.email, c])), [contacts]);
  const listLink = appUrl(`/?list=${list.id}`);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const shown = contacts.filter((c) => `${c.displayName || ''} ${c.email}`.toLowerCase().includes(search.toLowerCase()));

  function togglePick(email) {
    setPicked((s) => {
      const n = new Set(s);
      n.has(email) ? n.delete(email) : n.add(email);
      return n;
    });
  }

  // Returns the email that was added, or null (and shows why) if it wasn't
  function addEmail() {
    const v = emailInput.trim().toLowerCase();
    const fail = (msg) => { setEmailErr(msg); return null; };
    if (!v) return fail('Type an email address first.');
    if (!EMAIL_RE.test(v)) return fail(`“${v}” isn't a valid email address.`);
    if (v === myEmail) return fail("That's your own email.");
    if (memberEmails.has(v)) return fail('This person already has access. Change their access below.');
    if (emails.includes(v) || picked.has(v)) return fail('Already added.');
    if (members.length + picked.size + emails.length >= 100) return fail('A list can be shared with up to 100 people.');
    if (contacts.some((c) => c.email === v)) togglePick(v);
    else setEmails((es) => [...es, v]);
    setEmailInput('');
    setEmailErr('');
    return v;
  }

  const recipients = [...picked, ...emails];
  const pending = emailInput.trim() !== '';

  async function share() {
    // An email still sitting in the box (no + or Enter yet) counts too
    let to = recipients;
    if (pending) {
      const v = addEmail();
      if (!v) return;
      to = [...recipients, v];
    }
    if (!to.length) return;
    setBusy(true);
    try {
      await shareList(list, to, perm, user);
      let note = '';
      if (inviteEmailsEnabled) {
        await queueInviteEmails(list, to, user, listLink)
          .then(() => { note = ` · invitation email${to.length === 1 ? '' : 's'} sent`; })
          .catch(() => { note = ' · invitation emails failed, send them the link instead'; });
      }
      toast(`Shared with ${to.length} ${to.length === 1 ? 'person' : 'people'} · ${PERMISSIONS[perm].label}${note}`);
      if (!inviteEmailsEnabled) setJustShared(to);
      setPicked(new Set());
      setEmails([]);
    } catch (err) {
      toast(friendlyError(err), 'err');
    }
    setBusy(false);
  }

  async function onAccessChange(m, value) {
    try {
      if (value === '__remove') {
        await removeAccess(list.id, m.email);
        toast(`${m.email} no longer has access`);
      } else {
        await changeAccess(list.id, m.email, value);
        toast(`${m.email} now has ${PERMISSIONS[value].label.toLowerCase()} access`);
      }
    } catch (err) {
      toast(friendlyError(err), 'err');
    }
  }

  // Uses the access level picked under "What can they do?"
  async function addAgain(email) {
    setBusy(true);
    try {
      await shareList(list, [email], perm, user);
      toast(`${email} has ${PERMISSIONS[perm].label.toLowerCase()} access again`);
      if (!inviteEmailsEnabled) setJustShared([email]);
    } catch (err) {
      toast(friendlyError(err), 'err');
    }
    setBusy(false);
  }

  async function onClearLeft(email) {
    try {
      await clearLeft(list.id, email);
    } catch (err) {
      toast(friendlyError(err), 'err');
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(listLink);
      toast('Link copied');
    } catch {
      toast(listLink);
    }
  }

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <div className="m-h">
          <h2 id="share-title">Share “{list.title}”</h2>
          <button className="ic" type="button" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="m-b">
          <div>
            <span className="sec-l">From your contacts</span>
            <input id="contact-search" className="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search contacts" />
            <div className="contacts">
              {shown.length === 0 && (
                <div className="empty">
                  {contacts.length ? 'No contacts match.' : 'People you share lists with become your contacts. Add an email below to start.'}
                </div>
              )}
              {shown.map((c) => {
                const has = memberEmails.has(c.email);
                return (
                  <label key={c.email} className={has ? 'contact has' : 'contact'}>
                    <input type="checkbox" checked={picked.has(c.email)} disabled={has} onChange={() => togglePick(c.email)} />
                    <Avatar person={c} size={26} />
                    <span className="c-txt">
                      <span>{displayName(c)}</span>
                      <span className="em">{has ? 'Already has access' : left.includes(c.email) ? `${c.email} · left this list` : c.email}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <label className="sec-l" htmlFor="email-input">Or add email addresses</label>
            <div className="email-row">
              <input
                id="email-input"
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addEmail(); } }}
                placeholder="name@example.com"
                autoComplete="off"
              />
              <button className="plus" type="button" onClick={addEmail} aria-label="Add email">+</button>
            </div>
            {emailErr && <div className="err">{emailErr}</div>}
            {emails.length > 0 && (
              <div className="chips">
                {emails.map((e) => (
                  <span className="chip" key={e}>
                    <span>{e}</span>
                    <button type="button" onClick={() => setEmails((es) => es.filter((x) => x !== e))} aria-label={`Remove ${e}`}>✕</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <span className="sec-l">What can they do?</span>
            <div className="perms">
              {Object.entries(PERMISSIONS).map(([k, p]) => (
                <label key={k} className={perm === k ? 'perm on' : 'perm'}>
                  <input type="radio" name="perm" value={k} checked={perm === k} onChange={() => setPerm(k)} />
                  <span>
                    <b>{p.label}</b>
                    <small>{p.desc}</small>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {members.length > 0 && (
            <div>
              <span className="sec-l">People with access</span>
              <div className="access">
                {members.map((m) => {
                  const p = nameByEmail[m.email] || { email: m.email };
                  return (
                    <div className="arow" key={m.email}>
                      <Avatar person={p} size={28} />
                      <span className="nm" title={m.email}>{displayName(p)}</span>
                      <select id={`access-${m.email}`} value={m.permission} onChange={(e) => onAccessChange(m, e.target.value)} aria-label={`Access for ${m.email}`}>
                        {Object.entries(PERMISSIONS).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}
                        <option value="__remove">Remove access</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {left.length > 0 && (
            <div>
              <span className="sec-l">Left the list</span>
              <div className="access">
                {left.map((email) => {
                  const p = nameByEmail[email] || { email };
                  return (
                    <div className="arow gone" key={email}>
                      <Avatar person={p} size={28} />
                      <span className="nm" title={email}>
                        {displayName(p)}
                        <span className="em">Left on their own · no access</span>
                      </span>
                      <button className="btn" type="button" disabled={busy} onClick={() => addAgain(email)}
                        title={`Share again with ${PERMISSIONS[perm].label.toLowerCase()} access`}>
                        Add again
                      </button>
                      <button className="ic" type="button" onClick={() => onClearLeft(email)} aria-label={`Clear ${email} from this section`}>✕</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="linkrow">
            <span className="muted small">
              People you share with get a notification in the app. You can also send them this link. It only opens for
              people you&apos;ve shared with, after they sign in with that email.
            </span>
            {justShared.length > 0 && (
              <a className="btn" href={mailtoFor(justShared, list.title, listLink)}>
                ✉ Email {justShared.length === 1 ? justShared[0] : `${justShared.length} people`} the link
              </a>
            )}
            <div className="email-row">
              <input id="list-link" readOnly value={listLink} onFocus={(e) => e.target.select()} />
              <button className="btn" type="button" onClick={copyLink}>Copy</button>
            </div>
          </div>
        </div>

        <div className="m-f">
          <span className="sum">
            {recipients.length
              ? `${recipients.length} ${recipients.length === 1 ? 'person' : 'people'} will get ${PERMISSIONS[perm].label.toLowerCase()} access`
              : 'No one selected yet'}
          </span>
          <div className="row">
            <button className="btn" type="button" onClick={onClose}>Done</button>
            <button className="btn primary" type="button" disabled={(!recipients.length && !pending) || busy} onClick={share}>
              {busy ? 'Sharing…' : 'Share'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
