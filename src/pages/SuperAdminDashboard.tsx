import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import {
  fetchAdminAuditLog,
  fetchAuthEvents,
  fetchProcessSupervisionOverview,
  fetchRegistrationEnabled,
  fetchUserDirectory,
  runAccountAction,
  setRegistrationEnabled,
  superAdminResetUserPassword,
  superAdminUpdateUserRole,
} from '../lib/api';
import type { AccountAction, AdminAuditEntry, AuthEvent, DirectoryUser, ProcessSupervisionItem } from '../lib/api';
import type { AppRole, ApplicationStatus } from '../types/database.types';
import { useAuth } from '../features/auth/AuthContext';
import { INSTITUTION } from '../config/constants';
import '../styles/admin-console.css';

type Tab = 'overview' | 'people' | 'activity' | 'settings';
type PeopleFilter = 'all' | 'pending' | 'suspended' | 'staff';

const ROLE_LABEL: Record<AppRole, string> = { student: 'Student', admin: 'Coordinator', super_admin: 'Super admin' };

// Pipeline stages in workflow order, with the portal's status colours
const STAGES: { status: ApplicationStatus; label: string; color: string }[] = [
  { status: 'draft', label: 'Draft', color: '#C9BFA6' },
  { status: 'submitted', label: 'Submitted', color: '#6385B2' },
  { status: 'under_review', label: 'Under review', color: '#D99A2B' },
  { status: 'corrections_required', label: 'Corrections asked', color: '#C8504A' },
  { status: 'resubmitted', label: 'Resubmitted', color: '#204E96' },
  { status: 'approved_next_stage', label: 'Approved', color: '#2E8B57' },
];
const WAITING_ON_COORDINATOR: ApplicationStatus[] = ['submitted', 'resubmitted', 'under_review'];
const STALE_DAYS = 7;

const ACTION_LABEL: Record<string, string> = {
  role_changed: 'Changed role',
  password_reset: 'Set a new password',
  authenticator_reset: 'Reset authenticator',
  signed_out_everywhere: 'Signed out everywhere',
  account_suspended: 'Suspended account',
  account_reactivated: 'Reactivated account',
  registration_opened: 'Opened registration',
  registration_closed: 'Closed registration',
};

const DAY = 86_400_000;
const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / DAY);

function relative(iso: string | null): string {
  if (!iso) return 'Never';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const stamp = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function describeDetails(entry: AdminAuditEntry): string {
  const d = entry.details ?? {};
  if (entry.action === 'role_changed' && d.from && d.to) {
    return `${ROLE_LABEL[d.from as AppRole] ?? d.from} → ${ROLE_LABEL[d.to as AppRole] ?? d.to}`;
  }
  if (typeof d.reason === 'string') return `Reason: ${d.reason}`;
  if (typeof d.sessions_ended === 'number') return `${d.sessions_ended} session(s) ended`;
  if (typeof d.factors_removed === 'number') return `${d.factors_removed} authenticator(s) removed`;
  return '';
}

const isPending = (u: DirectoryUser) => !u.role && !u.email_confirmed_at;

export const SuperAdminDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [people, setPeople] = useState<DirectoryUser[]>([]);
  const [pipeline, setPipeline] = useState<ProcessSupervisionItem[]>([]);
  const [audit, setAudit] = useState<AdminAuditEntry[]>([]);
  const [authEvents, setAuthEvents] = useState<AuthEvent[]>([]);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<PeopleFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activityView, setActivityView] = useState<'admin' | 'auth'>('admin');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [dir, pipe, log, events, open] = await Promise.all([
        fetchUserDirectory(),
        fetchProcessSupervisionOverview(),
        fetchAdminAuditLog(),
        fetchAuthEvents().catch(() => [] as AuthEvent[]),
        fetchRegistrationEnabled(),
      ]);
      setPeople(dir);
      setPipeline(pipe);
      setAudit(log);
      setAuthEvents(events);
      setRegistrationOpen(open);
      setUpdatedAt(new Date());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'The console could not load.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Derived figures
  const pending = people.filter(isPending);
  const active = people.filter((u) => u.role);
  const suspended = people.filter((u) => u.suspended);
  const roleCount = (r: AppRole) => active.filter((u) => u.role === r).length;
  const stale = pipeline
    .filter((a) => WAITING_ON_COORDINATOR.includes(a.status) && daysSince(a.updated_at) >= STALE_DAYS)
    .sort((a, b) => a.updated_at.localeCompare(b.updated_at));
  const waitingLongest = pipeline
    .filter((a) => WAITING_ON_COORDINATOR.includes(a.status))
    .sort((a, b) => a.updated_at.localeCompare(b.updated_at))
    .slice(0, 6);
  const byDepartment = useMemo(() => {
    const counts = new Map<string, number>();
    pipeline.forEach((a) => counts.set(a.applicant_department || 'Not specified', (counts.get(a.applicant_department || 'Not specified') ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [pipeline]);
  const attentionCount = pending.length + suspended.length + stale.length + (registrationOpen ? 0 : 1);

  const openPeople = (f: PeopleFilter) => {
    setFilter(f);
    setQuery('');
    setTab('people');
  };

  const visiblePeople = people.filter((u) => {
    const q = query.trim().toLowerCase();
    if (q && !`${u.full_name ?? ''} ${u.email} ${u.registration_number ?? ''} ${u.department ?? ''}`.toLowerCase().includes(q)) return false;
    if (filter === 'pending') return isPending(u);
    if (filter === 'suspended') return u.suspended;
    if (filter === 'staff') return u.role === 'admin' || u.role === 'super_admin';
    return true;
  });

  const selected = people.find((u) => u.id === selectedId) ?? null;

  const tabs: { id: Tab; label: string; count?: number; alert?: boolean }[] = [
    { id: 'overview', label: 'Overview', count: attentionCount || undefined, alert: attentionCount > 0 },
    { id: 'people', label: 'People', count: people.length },
    { id: 'activity', label: 'Activity' },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <div className="container ac">
      <header className="ac-head">
        <div>
          <h1>Administration</h1>
          <p>Accounts, sign-in security and the patent pipeline for {INSTITUTION.NAME}.</p>
        </div>
        <div className="ac-head-tools">
          {updatedAt && <span aria-live="polite">Updated {updatedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>}
          <button type="button" className="btn btn-outline btn-sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} aria-hidden="true" className={loading ? 'animate-spin' : undefined} />
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      {loadError && (
        <div role="alert" className="alert alert-danger" style={{ marginBottom: 20 }}>
          <span>
            {loadError} Sign out and back in, then refresh.
          </span>
        </div>
      )}

      <div className="ac-tabs" role="tablist" aria-label="Administration sections">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`ac-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`ac-panel-${t.id}`}
            className="ac-tab"
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.count !== undefined && <span className={`ac-count${t.alert ? ' ac-count-alert' : ''}`}>{t.count}</span>}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`ac-panel-${tab}`} aria-labelledby={`ac-tab-${tab}`}>
        {tab === 'overview' && (
          <>
            <div className="ac-overview">
              <section className="ac-panel" aria-labelledby="ac-attention-title">
                <div className="ac-panel-head">
                  <h2 id="ac-attention-title">Needs attention</h2>
                </div>
                {loading && !people.length ? (
                  <div className="ac-panel-body">
                    <div className="ac-skeleton" style={{ width: '70%', marginBottom: 14 }} />
                    <div className="ac-skeleton" style={{ width: '55%', marginBottom: 14 }} />
                    <div className="ac-skeleton" style={{ width: '62%' }} />
                  </div>
                ) : attentionCount === 0 ? (
                  <p className="ac-calm">
                    <strong>Nothing needs attention.</strong> No sign-ups are waiting
                    and the coordinator queue has nothing older than {STALE_DAYS} days.
                  </p>
                ) : (
                  <ul className="ac-attention">
                    {!registrationOpen && (
                      <AttentionRow n="Off" title="Registration is closed" note="New students cannot sign up until you reopen it." action="Open settings" onAction={() => setTab('settings')} />
                    )}
                    {stale.length > 0 && (
                      <AttentionRow
                        n={stale.length}
                        title={`Waiting more than ${STALE_DAYS} days for the coordinator`}
                        note={`Oldest: ${stale[0].reference_number}, ${daysSince(stale[0].updated_at)} days.`}
                        action="See pipeline"
                        onAction={() => document.getElementById('ac-pipeline')?.scrollIntoView({ behavior: 'smooth' })}
                      />
                    )}
                    {pending.length > 0 && (
                      <AttentionRow n={pending.length} title="Sign-ups waiting for their email code" note="Unverified sign-ups are removed after 24 hours." action="Review" onAction={() => openPeople('pending')} />
                    )}
                    {suspended.length > 0 && (
                      <AttentionRow n={suspended.length} title="Suspended accounts" note="They cannot sign in until reactivated." action="Review" onAction={() => openPeople('suspended')} />
                    )}
                  </ul>
                )}
              </section>

              <section className="ac-panel" aria-labelledby="ac-people-title">
                <div className="ac-panel-head">
                  <h2 id="ac-people-title">Accounts</h2>
                  <button type="button" className="ac-link" onClick={() => openPeople('all')}>
                    Open people
                  </button>
                </div>
                <div className="ac-panel-body">
                  <dl className="ac-facts">
                    <dt>Students</dt>
                    <dd>{roleCount('student')}</dd>
                    <dt>Coordinators</dt>
                    <dd>{roleCount('admin')}</dd>
                    <dt>Super admins</dt>
                    <dd>{roleCount('super_admin')}</dd>
                    <dt>Waiting for email code</dt>
                    <dd>{pending.length}</dd>
                  </dl>
                </div>
              </section>
            </div>

            <section className="ac-panel" id="ac-pipeline" aria-labelledby="ac-pipeline-title">
              <div className="ac-panel-head">
                <h2 id="ac-pipeline-title">Pipeline</h2>
                <p>{pipeline.length} applications. Stages and dates only; disclosure content is never shown here.</p>
              </div>
              <div className="ac-panel-body">
                {pipeline.length === 0 ? (
                  <p className="ac-muted" style={{ margin: 0 }}>
                    No applications yet. Stages appear here as students start drafts.
                  </p>
                ) : (
                  <>
                    <div className="ac-bar" role="img" aria-label={STAGES.map((s) => `${s.label}: ${pipeline.filter((a) => a.status === s.status).length}`).join(', ')}>
                      {STAGES.map((s) => {
                        const n = pipeline.filter((a) => a.status === s.status).length;
                        return n ? <span key={s.status} style={{ width: `${(n / pipeline.length) * 100}%`, background: s.color }} /> : null;
                      })}
                    </div>
                    <ul className="ac-legend">
                      {STAGES.map((s) => (
                        <li key={s.status}>
                          <i style={{ background: s.color }} aria-hidden="true" />
                          {s.label}
                          <b>{pipeline.filter((a) => a.status === s.status).length}</b>
                        </li>
                      ))}
                    </ul>

                    <div className="ac-split">
                      <div>
                        <h3>By department</h3>
                        <table className="ac-table ac-compact">
                          <tbody>
                            {byDepartment.map(([dept, n]) => (
                              <tr key={dept}>
                                <td>{dept}</td>
                                <td className="ac-num">{n}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div>
                        <h3>Waiting longest for the coordinator</h3>
                        {waitingLongest.length === 0 ? (
                          <p className="ac-muted" style={{ margin: 0 }}>The coordinator queue is empty.</p>
                        ) : (
                          <table className="ac-table ac-compact">
                            <tbody>
                              {waitingLongest.map((a) => (
                                <tr key={a.id}>
                                  <td>
                                    <strong style={{ color: 'var(--text-primary)' }}>{a.reference_number}</strong>
                                    <div className="ac-muted" style={{ fontSize: '0.8125rem' }}>
                                      {a.applicant_name} · {STAGES.find((s) => s.status === a.status)?.label}
                                    </div>
                                  </td>
                                  <td className="ac-num">
                                    <span className={`ac-tag${daysSince(a.updated_at) >= STALE_DAYS ? ' ac-tag-warn' : ''}`}>
                                      {daysSince(a.updated_at)} d
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </section>
          </>
        )}

        {tab === 'people' && (
          <section className="ac-panel">
            <div className="ac-toolbar">
              <label htmlFor="ac-search" className="ac-sr">
                Search people
              </label>
              <input
                id="ac-search"
                type="search"
                className="form-control"
                placeholder="Name, email, registration no."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <div className="ac-seg" role="group" aria-label="Filter people">
                {(
                  [
                    ['all', 'Everyone'],
                    ['staff', 'Staff'],
                    ['pending', 'Waiting for code'],
                    ['suspended', 'Suspended'],
                  ] as [PeopleFilter, string][]
                ).map(([id, label]) => (
                  <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {visiblePeople.length === 0 ? (
              <p className="ac-empty ac-muted">{loading ? 'Loading accounts…' : 'No accounts match this view.'}</p>
            ) : (
              <div className="ac-table-wrap">
                <table className="ac-table">
                  <thead>
                    <tr>
                      <th scope="col">Person</th>
                      <th scope="col">Role</th>
                      <th scope="col">Sign-in security</th>
                      <th scope="col">Last sign-in</th>
                      <th scope="col">Joined</th>
                      <th scope="col">
                        <span className="ac-sr">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiblePeople.map((u) => (
                      <tr key={u.id}>
                        <td className="ac-person">
                          <strong>{u.full_name ?? 'Not verified yet'}</strong>
                          <span>{u.email}</span>
                        </td>
                        <td>{u.role ? <span className={`ac-tag${u.role !== 'student' ? ' ac-tag-role' : ''}`}>{ROLE_LABEL[u.role]}</span> : <span className="ac-muted">None</span>}</td>
                        <td>
                          <SecurityTags user={u} />
                        </td>
                        <td className="ac-muted">{relative(u.last_sign_in_at)}</td>
                        <td className="ac-muted">{relative(u.created_at)}</td>
                        <td className="ac-num">
                          <button type="button" className="ac-row-btn" onClick={() => setSelectedId(u.id)} aria-label={`Manage ${u.full_name ?? u.email}`}>
                            Manage
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {tab === 'activity' && (
          <section className="ac-panel">
            <div className="ac-toolbar">
              <div className="ac-seg" role="group" aria-label="Activity source">
                <button type="button" aria-pressed={activityView === 'admin'} onClick={() => setActivityView('admin')}>
                  Admin actions
                </button>
                <button type="button" aria-pressed={activityView === 'auth'} onClick={() => setActivityView('auth')}>
                  Sign-in events
                </button>
              </div>
              <span className="ac-muted" style={{ fontSize: '0.8125rem' }}>
                {activityView === 'admin' ? 'Every change made from this console, newest first. Entries cannot be edited or deleted.' : 'Sign-ups, sign-ins, code emails and authenticator events from Supabase Auth.'}
              </span>
            </div>
            {activityView === 'admin' ? (
              audit.length === 0 ? (
                <p className="ac-empty ac-muted">No admin actions yet. Role changes, resets and suspensions will be listed here.</p>
              ) : (
                <div className="ac-table-wrap">
                  <table className="ac-table">
                    <thead>
                      <tr>
                        <th scope="col">When</th>
                        <th scope="col">By</th>
                        <th scope="col">Action</th>
                        <th scope="col">Account</th>
                        <th scope="col">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {audit.map((e) => (
                        <tr key={e.id}>
                          <td className="ac-muted" style={{ whiteSpace: 'nowrap' }}>{stamp(e.created_at)}</td>
                          <td>{e.actor_email ?? 'SQL editor'}</td>
                          <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{ACTION_LABEL[e.action] ?? e.action}</td>
                          <td>{e.target_email ?? '—'}</td>
                          <td className="ac-muted">{describeDetails(e)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : authEvents.length === 0 ? (
              <p className="ac-empty ac-muted">No sign-in events to show. They come from the live Supabase project only.</p>
            ) : (
              <div className="ac-table-wrap">
                <table className="ac-table">
                  <thead>
                    <tr>
                      <th scope="col">When</th>
                      <th scope="col">Event</th>
                      <th scope="col">Account</th>
                      <th scope="col">IP address</th>
                    </tr>
                  </thead>
                  <tbody>
                    {authEvents.map((e, i) => (
                      <tr key={`${e.created_at}-${i}`}>
                        <td className="ac-muted" style={{ whiteSpace: 'nowrap' }}>{stamp(e.created_at)}</td>
                        <td style={{ color: 'var(--text-primary)' }}>{e.action.replace(/_/g, ' ')}</td>
                        <td>{e.actor ?? '—'}</td>
                        <td className="ac-muted">{e.ip_address || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {tab === 'settings' && (
          <RegistrationSetting
            open={registrationOpen}
            onChanged={(open) => {
              setRegistrationOpen(open);
              void load();
            }}
          />
        )}
      </div>

      {selected && (
        <AccountDrawer
          user={selected}
          isSelf={selected.id === currentUser?.id}
          onClose={() => setSelectedId(null)}
          onChanged={() => void load()}
        />
      )}
    </div>
  );
};

const AttentionRow: React.FC<{ n: number | string; title: string; note: string; action: string; onAction: () => void }> = ({
  n,
  title,
  note,
  action,
  onAction,
}) => (
  <li>
    <span className="ac-attention-n">{n}</span>
    <div>
      <strong>{title}</strong>
      <span>{note}</span>
    </div>
    <button type="button" className="ac-link" onClick={onAction}>
      {action}
    </button>
  </li>
);

const SecurityTags: React.FC<{ user: DirectoryUser }> = ({ user }) => (
  <div className="ac-tags">
    {user.suspended && <span className="ac-tag ac-tag-bad">Suspended</span>}
    {user.email_confirmed_at ? <span className="ac-tag ac-tag-ok">Email verified</span> : <span className="ac-tag ac-tag-warn">Waiting for code</span>}
  </div>
);

const RegistrationSetting: React.FC<{ open: boolean; onChanged: (open: boolean) => void }> = ({ open, onChanged }) => {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = async (next: boolean) => {
    setBusy(true);
    setError(null);
    const r = await setRegistrationEnabled(next);
    setBusy(false);
    setConfirming(false);
    if (r.success) onChanged(next);
    else setError(r.error ?? 'The setting could not be changed.');
  };

  return (
    <section className="ac-panel">
      <div className="ac-panel-body">
        <div className="ac-setting">
          <div>
            <h3 id="ac-registration-label">Student registration</h3>
            <p>
              {open
                ? 'Open. Anyone with an @' + INSTITUTION.DOMAIN + ' address can sign up and verify with an emailed code.'
                : 'Closed. New sign-ups are refused; existing accounts keep signing in.'}{' '}
              Use this to stop a wave of fake sign-ups or while email delivery is down.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            className="ac-switch"
            aria-checked={open}
            aria-labelledby="ac-registration-label"
            disabled={busy}
            onClick={() => (open ? setConfirming(true) : void apply(true))}
          />
        </div>
        {confirming && (
          <div className="ac-confirm" role="alertdialog" aria-label="Confirm closing registration">
            Close registration? Students who have not signed up yet will see "Registration is temporarily unavailable".
            <div className="ac-inline">
              <button type="button" className="btn btn-danger btn-sm" onClick={() => void apply(false)} disabled={busy}>
                Close registration
              </button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setConfirming(false)}>
                Keep it open
              </button>
            </div>
          </div>
        )}
        {error && <p className="ac-feedback ac-feedback-bad" role="alert">{error}</p>}
      </div>
    </section>
  );
};

type Feedback = { ok: boolean; text: string } | null;

const AccountDrawer: React.FC<{ user: DirectoryUser; isSelf: boolean; onClose: () => void; onChanged: () => void }> = ({
  user,
  isSelf,
  onClose,
  onChanged,
}) => {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [role, setRole] = useState<AppRole>(user.role ?? 'student');
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState<AccountAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const done = (key: string, ok: boolean, text: string) => {
    setFeedback((f) => ({ ...f, [key]: { ok, text } }));
    if (ok) onChanged();
  };

  const saveRole = async () => {
    setBusy(true);
    const r = await superAdminUpdateUserRole(user.id, role);
    setBusy(false);
    done('role', r.success, r.success ? `Role changed to ${ROLE_LABEL[role]}.` : r.error ?? 'The role could not be changed.');
  };

  const savePassword = async () => {
    if (password.length < 6) {
      done('password', false, 'Use at least 6 characters.');
      return;
    }
    setBusy(true);
    const r = await superAdminResetUserPassword(user.email, password);
    setBusy(false);
    if (r.success) setPassword('');
    done('password', r.success, r.success ? 'New password set. Share it with the person privately.' : r.error ?? 'The password could not be set.');
  };

  const run = async (action: AccountAction) => {
    setBusy(true);
    const r = await runAccountAction(action, user, reason);
    setBusy(false);
    setConfirm(null);
    if (r.success) setReason('');
    const text: Record<AccountAction, string> = {
      reset_authenticator: 'Authenticator removed.',
      sign_out: 'All sessions ended.',
      suspend: 'Account suspended and signed out.',
      reactivate: 'Account reactivated.',
    };
    done(action, r.success, r.success ? text[action] : r.error ?? 'That did not work. Refresh and try again.');
  };

  const Feedback = ({ k }: { k: string }) =>
    feedback[k] ? (
      <p className={`ac-feedback ${feedback[k]!.ok ? 'ac-feedback-ok' : 'ac-feedback-bad'}`} role={feedback[k]!.ok ? 'status' : 'alert'}>
        {feedback[k]!.text}
      </p>
    ) : null;

  const Confirm = ({ action, text, label }: { action: AccountAction; text: string; label: string }) =>
    confirm === action ? (
      <div className="ac-confirm">
        {text}
        <div className="ac-inline">
          <button type="button" className="btn btn-danger btn-sm" onClick={() => void run(action)} disabled={busy}>
            {label}
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setConfirm(null)}>
            Cancel
          </button>
        </div>
      </div>
    ) : null;

  return (
    <>
      <div className="ac-scrim" onClick={onClose} aria-hidden="true" />
      <aside className="ac-drawer" role="dialog" aria-modal="true" aria-labelledby="ac-drawer-title">
        <div className="ac-drawer-head">
          <div>
            <h2 id="ac-drawer-title">{user.full_name ?? 'Unverified sign-up'}</h2>
            <p>{user.email}</p>
            <SecurityTags user={user} />
          </div>
          <button ref={closeRef} type="button" className="ac-close" onClick={onClose} aria-label="Close">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="ac-drawer-body">
          <section className="ac-section">
            <dl className="ac-kv">
              <dt>Role</dt>
              <dd>{user.role ? ROLE_LABEL[user.role] : 'None until the email code is entered'}</dd>
              <dt>Department</dt>
              <dd>{user.department ?? '—'}</dd>
              <dt>Registration no.</dt>
              <dd>{user.registration_number ?? '—'}</dd>
              <dt>Joined</dt>
              <dd>{stamp(user.created_at)}</dd>
              <dt>Last sign-in</dt>
              <dd>{user.last_sign_in_at ? stamp(user.last_sign_in_at) : 'Never'}</dd>
            </dl>
          </section>

          {user.role ? (
            <>
              <section className="ac-section">
                <h3>Role</h3>
                <p>Coordinators review applications. Super admins run this console.</p>
                <div className="ac-inline">
                  <label htmlFor="ac-role" className="ac-sr">
                    Role
                  </label>
                  <select id="ac-role" className="form-control" value={role} onChange={(e) => setRole(e.target.value as AppRole)} disabled={isSelf}>
                    <option value="student">Student</option>
                    <option value="admin">Coordinator</option>
                    <option value="super_admin">Super admin</option>
                  </select>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => void saveRole()} disabled={busy || isSelf || role === user.role}>
                    Save role
                  </button>
                </div>
                {isSelf && <p className="ac-feedback ac-muted">Another super admin must change your own role.</p>}
                <Feedback k="role" />
              </section>

              <section className="ac-section">
                <h3>Password</h3>
                <p>For someone who cannot use the emailed reset. They should change it after signing in.</p>
                <div className="ac-inline">
                  <label htmlFor="ac-password" className="ac-sr">
                    New password
                  </label>
                  <input
                    id="ac-password"
                    type="text"
                    className="form-control"
                    placeholder="New password (6+ characters)"
                    autoComplete="off"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => void savePassword()} disabled={busy || !password}>
                    Set password
                  </button>
                </div>
                <Feedback k="password" />
              </section>

              {user.has_authenticator && (
                <section className="ac-section">
                  <h3>Old authenticator</h3>
                  <p>Sign-in no longer uses an authenticator app. Remove this one so a password reset does not ask for its code.</p>
                  <button
                    type="button"
                    className="ac-row-btn ac-row-btn-danger"
                    onClick={() => setConfirm('reset_authenticator')}
                    disabled={busy || isSelf}
                  >
                    Remove authenticator
                  </button>
                  {isSelf && <p className="ac-feedback ac-muted">Another super admin must remove your own authenticator.</p>}
                  <Confirm action="reset_authenticator" label="Remove authenticator" text="This also signs them out on every device." />
                  <Feedback k="reset_authenticator" />
                </section>
              )}

              <section className="ac-section">
                <h3>Sessions</h3>
                <p>Ends sign-ins on every device. Open tabs lose access within the hour.</p>
                <button type="button" className="ac-row-btn" onClick={() => void run('sign_out')} disabled={busy}>
                  Sign out everywhere
                </button>
                <Feedback k="sign_out" />
              </section>
            </>
          ) : (
            <section className="ac-section">
              <h3>Waiting for the email code</h3>
              <p>This person signed up but has not entered the code from their inbox. Unverified sign-ups are removed after 24 hours.</p>
            </section>
          )}

          <section className="ac-section">
            <h3>{user.suspended ? 'Suspended' : 'Suspend account'}</h3>
            {user.suspended ? (
              <>
                <p>This account cannot sign in.</p>
                <button type="button" className="ac-row-btn" onClick={() => void run('reactivate')} disabled={busy}>
                  Reactivate account
                </button>
                <Feedback k="suspend" />
                <Feedback k="reactivate" />
              </>
            ) : (
              <>
                <p>Blocks sign-in and ends every session. Their applications and data stay as they are.</p>
                <div className="ac-inline">
                  <label htmlFor="ac-reason" className="ac-sr">
                    Reason
                  </label>
                  <input
                    id="ac-reason"
                    className="form-control"
                    placeholder="Reason, kept in the activity log"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    disabled={isSelf || user.role === 'super_admin'}
                  />
                  <button
                    type="button"
                    className="ac-row-btn ac-row-btn-danger"
                    onClick={() => setConfirm('suspend')}
                    disabled={busy || isSelf || user.role === 'super_admin'}
                  >
                    Suspend
                  </button>
                </div>
                {user.role === 'super_admin' && !isSelf && <p className="ac-feedback ac-muted">Change the role first: super admins cannot be suspended.</p>}
                <Confirm action="suspend" label="Suspend account" text={`Suspend ${user.full_name ?? user.email}? They are signed out now and cannot sign in until reactivated.`} />
                <Feedback k="reactivate" />
              </>
            )}
          </section>
        </div>
      </aside>
    </>
  );
};

export default SuperAdminDashboard;
