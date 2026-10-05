import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useUnit } from '../context/UnitContext';
import { hasRole, canPostAnnouncement } from '../utils/permissions';
import { useToast } from '../components/Toast';

import dialog from '../components/dialog';
import { XIcon } from '../components/icons';

export default function AnnouncementsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { ctx } = useUnit();
  const toast = useToast?.() || { success: () => {}, error: () => {} };

  const audienceModes = useMemo(() => [
    { value: 'PERSON',  label: t('announcements.modes.personLabel', 'A specific person'),          help: t('announcements.modes.personHelp', 'Direct message — only that member will see it.') },
    { value: 'OWN',     label: t('announcements.modes.ownLabel', 'This unit only'),             help: t('announcements.modes.ownHelp', "Visible to everyone in the unit you're posting from.") },
    { value: 'SUBTREE', label: t('announcements.modes.subtreeLabel', 'This unit + everything below'), help: t('announcements.modes.subtreeHelp', 'Cascades down to every sub-unit beneath you.') },
    { value: 'GLOBAL',  label: t('announcements.modes.globalLabel', 'Everyone (org-wide)'),        help: t('announcements.modes.globalHelp', 'Visible to every member in PKNAP.') },
  ], [t]);

  // Driven by the dynamic permission catalogue — Super Admin can
  // grant POST_ANNOUNCEMENT to additional roles from Role Management.
  const canPost = canPostAnnouncement(user);

  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const [form, setForm] = useState({
    title: '', body: '', mode: 'OWN', pinned: false, expiresAt: '',
    targetMemberId: '', targetMemberLabel: '',
  });

  // Member directory for the "specific person" picker — fetched lazily
  // when the composer opens in PERSON mode. Scoped to whatever the
  // sender's natural /api/members access already returns.
  const [members, setMembers] = useState([]);
  const [memberQuery, setMemberQuery] = useState('');
  const [membersLoading, setMembersLoading] = useState(false);

  // "now" tick — bumped once a minute so expired announcements drop
  // off the rendered list immediately, without waiting for the next
  // server poll. Stored as a millisecond timestamp so the dependency
  // shifts cleanly when minute boundaries cross.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  async function load(silent = false) {
    if (!silent) setBusy(true);
    setErr('');
    try {
      const r = await api.get('/announcements');
      setItems(r.data.data || []);
    } catch (e) { if (!silent) setErr(errorMessage(e)); }
    finally { if (!silent) setBusy(false); }
  }
  useEffect(() => { load(false); }, []);

  // Real-time poll — refetch every 60s while the tab is visible, plus
  // immediately on tab focus / visibilitychange. Server already drops
  // expired rows; this just keeps the list in sync without a reload.
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') load(true); };
    const t = setInterval(tick, 60000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, []);

  // Client-side expiry guard — hides expired announcements at render
  // even before the next server refetch, so the user never sees a
  // message stick around past its expiresAt.
  const visibleItems = useMemo(() => {
    return (items || []).filter((a) => {
      if (!a.expiresAt) return true;
      return new Date(a.expiresAt).getTime() > now;
    });
  }, [items, now]);

  // Fetch members the first time someone switches to "specific person".
  useEffect(() => {
    if (!composeOpen || form.mode !== 'PERSON' || members.length > 0 || membersLoading) return;
    setMembersLoading(true);
    // scope:'all' — explicit opt-in for the unfiltered roster. The
    // server clamps scoped users to their own hierarchy regardless.
    api.get('/members', { params: { status: 'ACTIVE', limit: 500, scope: 'all' } })
      .then((r) => setMembers(r.data.data || []))
      .catch(() => setMembers([]))
      .finally(() => setMembersLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composeOpen, form.mode]);

  const filteredMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    if (!q) return members.slice(0, 50);
    return members.filter((m) => {
      return (m.fullName || '').toLowerCase().includes(q)
        || (m.cnic || '').includes(q)
        || (m.memberId || '').toLowerCase().includes(q);
    }).slice(0, 50);
  }, [members, memberQuery]);

  async function submit() {
    setErr('');
    if (!form.title || !form.body) { setErr(t('announcements.titleAndBodyRequired', 'Title and body are required.')); return; }
    if (form.mode === 'PERSON' && !form.targetMemberId) {
      setErr(t('announcements.pickMemberRequired', 'Pick the member you want to message.')); return;
    }
    try {
      const payload = {
        title: form.title,
        body: form.body,
        pinned: !!form.pinned,
        ...(form.expiresAt ? { expiresAt: new Date(form.expiresAt).toISOString() } : {}),
      };
      if (form.mode === 'PERSON') {
        payload.targetMemberId = form.targetMemberId;
      } else {
        payload.scope = form.mode; // OWN | SUBTREE | GLOBAL
        if (ctx?.unitLevel && ctx?.unitId && form.mode !== 'GLOBAL') {
          payload.unitLevel = ctx.unitLevel;
          payload.unitId = ctx.unitId;
        } else {
          payload.unitLevel = 'CENTRAL';
          if (form.mode === 'OWN') payload.scope = 'GLOBAL';
        }
      }
      await api.post('/announcements', payload);
      toast.success?.(form.mode === 'PERSON' ? t('announcements.messageSent', 'Message sent.') : t('announcements.announcementPosted', 'Announcement posted.'));
      setForm({ title: '', body: '', mode: 'OWN', pinned: false, expiresAt: '', targetMemberId: '', targetMemberLabel: '' });
      setMemberQuery('');
      setComposeOpen(false);
      load();
    } catch (e) {
      toast.error(errorMessage(e), { title: t('announcements.couldNotPost', 'Could not post announcement'), duration: 9000 });
    }
  }

  async function remove(id) {
    if (!await dialog.confirm(t('announcements.deleteConfirm', 'Delete this announcement?'))) return;
    try {
      await api.delete(`/announcements/${id}`);
      load();
      toast.success(t('announcements.deleted', 'Announcement deleted.'));
    } catch (e) {
      toast.error(errorMessage(e), { title: t('announcements.couldNotDelete', 'Could not delete announcement'), duration: 7000 });
    }
  }

  function openCompose() {
    setForm({ title: '', body: '', mode: 'OWN', pinned: false, expiresAt: '', targetMemberId: '', targetMemberLabel: '' });
    setComposeOpen(true);
  }
  function pickMember(m) {
    setForm((f) => ({ ...f, targetMemberId: m._id, targetMemberLabel: `${m.fullName} · ${m.memberId || m.cnic}` }));
  }

  const audienceMeta = audienceModes.find((m) => m.value === form.mode);

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>{t('announcements.title', 'Announcements')}</h2>
          <div className="subtitle">{t('announcements.subtitle', 'Broadcasts from your unit, tiers above, and direct messages addressed to you.')}</div>
        </div>
        {canPost && (
          <button className="btn" onClick={openCompose}>{t('announcements.newAnnouncement', '+ New Announcement')}</button>
        )}
      </div>

      {err && <div className="alert error">{err}</div>}

      {busy && <p className="muted">{t('common.loading', 'Loading…')}</p>}
      {!busy && visibleItems.length === 0 && (
        <div className="empty-smart">
          <div className="empty-icon">📣</div>
          <h3>{t('announcements.noAnnouncements', 'No announcements')}</h3>
          <p>{t('announcements.emptySubtitle', "When the Senior Mawin Sec. or General Sec. posts, it'll appear here.")}</p>
        </div>
      )}

      <div className="ann-list">
        {visibleItems.map((a) => {
          const isDirect = !!a.targetMemberId;
          const targetLabel = a.targetMemberId?.fullName
            ? `${a.targetMemberId.fullName}${a.targetMemberId.memberId ? ` · ${a.targetMemberId.memberId}` : ''}`
            : 'a member';
          return (
            <div key={a._id} className={`ann-card ${a.pinned ? 'pinned' : ''} ${isDirect ? 'direct' : ''}`}>
              {a.pinned && <div className="ann-pin-badge">📌 {t('announcements.pinned', 'Pinned')}</div>}
              <div className="ann-card-head">
                <h3>{a.title}</h3>
                <div className="ann-card-meta">
                  {isDirect ? (
                    <>
                      <span className="badge ACTIVE">{t('announcements.directMessage', 'Direct message')}</span>
                      <span className="muted">{t('announcements.toMember', { name: targetLabel })}</span>
                    </>
                  ) : (
                    <>
                      <span className="badge">{a.unitLevel}</span>
                      <span className="badge">{a.scope}</span>
                    </>
                  )}
                  <span className="muted">{new Date(a.createdAt).toLocaleString()}</span>
                </div>
              </div>
              <p className="ann-body">{a.body}</p>
              <div className="ann-foot">
                <span className="muted">{t('announcements.by', { name: a.authorName || t('announcements.admin', 'Admin') })}</span>
                {(canPost && (String(a.authorUserId) === String(user?._id) || user?.roles?.includes('SUPER_ADMIN'))) && (
                  <button className="btn ghost danger" onClick={() => remove(a._id)}>{t('announcements.delete', 'Delete')}</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {composeOpen && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setComposeOpen(false); }}>
          <div className="modal" style={{ maxWidth: 720 }} role="dialog" aria-modal="true" aria-label="Post Announcement">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>{form.mode === 'PERSON' ? t('announcements.sendDirectMessage', 'Send Direct Message') : t('announcements.postAnnouncement', 'Post Announcement')}</h3>
              <button type="button" className="btn secondary" onClick={() => setComposeOpen(false)} aria-label="Close" style={{ padding: '4px 10px', fontSize: 18, lineHeight: 1 }}><XIcon size={16} /></button>
            </div>

            <div className="field full" style={{ marginBottom: 12 }}>
              <label>{t('announcements.audience', 'Audience')}</label>
              <div className="audience-grid">
                {audienceModes.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    className={`audience-tile ${form.mode === m.value ? 'active' : ''}`}
                    onClick={() => setForm({ ...form, mode: m.value })}
                  >
                    <div className="audience-tile-label">{m.label}</div>
                    <div className="audience-tile-help">{m.help}</div>
                  </button>
                ))}
              </div>
              {form.mode !== 'PERSON' && (
                <div className="hint" style={{ marginTop: 6 }}>
                  {ctx?.unitLevel
                    ? t('announcements.postingFrom', { unit: `${ctx.unitLevel.replace('_', ' ')} · ${ctx.unitName || ''}` })
                    : t('announcements.postingAtCentral', 'Posting at Central tier.')}
                </div>
              )}
            </div>

            {form.mode === 'PERSON' && (
              <div className="field full" style={{ marginBottom: 12 }}>
                <label>{t('announcements.recipient', 'Recipient')}</label>
                {form.targetMemberId ? (
                  <div className="audience-picked">
                    <span>{form.targetMemberLabel}</span>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => setForm({ ...form, targetMemberId: '', targetMemberLabel: '' })}
                    >{t('announcements.change', 'Change')}</button>
                  </div>
                ) : (
                  <>
                    <input
                      placeholder={membersLoading ? t('announcements.loadingMembers', 'Loading members…') : t('announcements.searchPlaceholder', 'Search by name, ID, or CNIC')}
                      value={memberQuery}
                      onChange={(e) => setMemberQuery(e.target.value)}
                      disabled={membersLoading}
                    />
                    <div className="audience-results">
                      {!membersLoading && filteredMembers.length === 0 && (
                        <div className="audience-empty">{t('announcements.noMatchingMembers', 'No matching members.')}</div>
                      )}
                      {filteredMembers.map((m) => (
                        <button
                          key={m._id}
                          type="button"
                          className="audience-result"
                          onClick={() => pickMember(m)}
                        >
                          <div className="audience-result-name">{m.fullName}</div>
                          <div className="audience-result-meta">{m.memberId || m.cnic}{m.phone ? ` · ${m.phone}` : ''}</div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="form-grid">
              <div className="field full">
                <label>{t('announcements.announcementTitle', 'Title')}</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={140} placeholder={form.mode === 'PERSON' ? t('announcements.directTitlePlaceholder') : t('announcements.broadcastTitlePlaceholder')} />
              </div>
              <div className="field full">
                <label>{t('announcements.body', 'Body')}</label>
                <textarea
                  rows={5}
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  maxLength={4000}
                  placeholder={t('announcements.bodyPlaceholder')}
                />
              </div>
              <div className="field">
                <label>{t('announcements.expires', 'Expires (optional)')}</label>
                <input type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
              </div>
              <div className="field">
                <label>
                  <input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} style={{ marginRight: 6 }} />
                  {t('announcements.pinToTop', 'Pin to top')}
                </label>
              </div>
            </div>
            <div style={{ marginTop: 18, display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button className="btn secondary" type="button" onClick={() => setComposeOpen(false)}>{t('announcements.cancel', 'Cancel')}</button>
              <button className="btn" onClick={submit}>{form.mode === 'PERSON' ? t('announcements.sendMessage', 'Send Message') : t('announcements.post', 'Post')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
