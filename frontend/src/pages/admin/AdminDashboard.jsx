import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Activity, AlertTriangle, ArrowRight, Bell, Check, ChevronRight,
  ClipboardList, FileText, Gauge, LayoutDashboard, LoaderCircle, LockKeyhole,
  RefreshCw, Shield, ShieldAlert, Settings, UsersRound, X,
} from "lucide-react";
import api, { getApiError } from "../../services/api";
import { useAuth } from "../../context/useAuth";

const adminNavigation = [
  ["Overview", "/admin/overview", LayoutDashboard],
  ["Users", "/admin/users", UsersRound],
  ["Public notes", "/admin/notes", FileText],
  ["Reports", "/admin/reports", ShieldAlert],
  ["Moderation", "/admin/moderation", Shield],
  ["Announcements", "/admin/announcements", Bell],
  ["Analytics", "/admin/analytics", Gauge],
  ["Service health", "/admin/health", Activity],
  ["Audit logs", "/admin/audit-logs", ClipboardList],
  ["Admin settings", "/admin/settings", Settings],
];

function AdminAccessGate() {
  const [state, setState] = useState({ loading: true, allowed: false, error: "" });
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        await api.get("/api/notes/admin/public", { params: { page: 1, pageSize: 1 } });
        if (active) setState({ loading: false, allowed: true, error: "" });
      } catch (error) {
        if (active) setState({ loading: false, allowed: false, error: getApiError(error) });
      }
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, []);

  if (state.loading) return <div className="admin-access-loading"><LoaderCircle size={24} className="animate-spin" /><span>Verifying administrator access…</span></div>;
  if (!state.allowed) return <div className="admin-access-denied"><ShieldAlert size={32} /><p className="admin-eyebrow">RESTRICTED AREA</p><h1>Administrator access required</h1><p>This account could not access the protected public-note administration API.</p>{state.error && <small>{state.error}</small>}<Link to="/dashboard" className="admin-button-secondary">Return to TaskFlow</Link></div>;
  return <Outlet />;
}

function AdminLayout() {
  const location = useLocation();
  const page = adminNavigation.find(([, path]) => location.pathname === path) || adminNavigation[0];
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link to="/admin/overview" className="admin-brand"><span><Shield size={19} /></span><div><strong>TaskFlow</strong><small>ADMIN CONSOLE</small></div></Link>
        <p className="admin-nav-caption">ADMINISTRATION</p>
        <nav aria-label="Admin navigation">{adminNavigation.map(([label, path, Icon]) => <NavLink key={path} to={path} end={path === "/admin/overview"} className={({ isActive }) => `admin-nav-link ${isActive ? "is-active" : ""}`}><Icon size={16} /><span>{label}</span><ChevronRight size={13} className="admin-nav-chevron" /></NavLink>)}</nav>
        <div className="admin-sidebar-footer"><Shield size={15} /><span>Protected workspace</span></div>
      </aside>
      <div className="admin-main-column">
        <header className="admin-topbar"><div><span>TaskFlow / Admin</span><strong>{page[0]}</strong></div><Link to="/dashboard" className="admin-exit-link">Exit admin <ArrowRight size={14} /></Link></header>
        <main className="admin-content"><Outlet /></main>
      </div>
    </div>
  );
}

function AdminPageHeader({ eyebrow = "ADMIN CONSOLE", title, description, action }) {
  return <header className="admin-page-heading"><div><p className="admin-eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{action}</header>;
}

function AdminNotice({ children, tone = "info" }) {
  const Icon = tone === "warning" ? AlertTriangle : InfoIcon;
  return <div className={`admin-notice is-${tone}`}><Icon size={16} /><p>{children}</p></div>;
}

function InfoIcon({ size = 16 }) { return <Activity size={size} />; }

function MetricCard({ label, value, icon: Icon, tone = "teal", detail }) {
  return <article className="admin-metric-card"><span className={`admin-metric-icon is-${tone}`}><Icon size={18} /></span><div><span>{label}</span><strong>{value ?? "—"}</strong>{detail && <small>{detail}</small>}</div></article>;
}

function useAdminOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    const [notes, reports, announcements, health, ready] = await Promise.allSettled([
      api.get("/api/notes/admin/public", { params: { page: 1, pageSize: 1 } }),
      api.get("/api/notes/admin/reports", { params: { page: 1, pageSize: 1 } }),
      api.get("/api/notifications/announcements", { params: { page: 1, pageSize: 1 } }),
      api.get("/health"),
      api.get("/ready"),
    ]);
    const next = {
      publicNotes: notes.status === "fulfilled" ? notes.value.data.pagination.total : null,
      reports: reports.status === "fulfilled" ? reports.value.data.pagination.total : null,
      announcements: announcements.status === "fulfilled" ? announcements.value.data.pagination.total : null,
      gateway: health.status === "fulfilled" ? health.value.data : null,
      readiness: ready.status === "fulfilled" ? ready.value.data : null,
      failures: [notes, reports, announcements, health, ready].filter((item) => item.status === "rejected").length,
    };
    setData(next);
    if (next.failures === 5) setError("Admin summary data is unavailable. Check the API Gateway and service connections.");
    else if (next.failures > 0) setError("Some overview metrics could not be loaded.");
    setLoading(false);
  }, []);
  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer); }, [load]);
  return { data, loading, error, load };
}

function AdminOverview() {
  const { data, loading, error, load } = useAdminOverview();
  return <div className="admin-page"><AdminPageHeader title="Admin overview" description="Review public content, reports, announcements, and gateway configuration." action={<button type="button" className="admin-button-secondary" onClick={load} disabled={loading}><RefreshCw size={15} />Refresh</button>} />
    {error && <AdminNotice tone="warning">{error}</AdminNotice>}
    <section className="admin-metric-grid" aria-label="Overview metrics">{loading ? Array.from({ length: 4 }, (_, index) => <div className="admin-metric-skeleton" key={index} />) : <><MetricCard label="Public notes" value={data?.publicNotes} icon={FileText} detail="Public content only" /><MetricCard label="Reports" value={data?.reports} icon={ShieldAlert} tone="amber" detail="All report statuses" /><MetricCard label="Announcements" value={data?.announcements} icon={Bell} tone="blue" detail="Published items" /><MetricCard label="Gateway" value={data?.gateway?.status || "Unavailable"} icon={Activity} tone={data?.gateway?.status === "running" ? "green" : "coral"} detail={data?.readiness?.success ? "Dependencies configured" : "Readiness check failed"} /></>}</section>
    <section className="admin-overview-grid"><article className="admin-panel"><div className="admin-panel-heading"><div><p className="admin-eyebrow">CONTENT SAFETY</p><h2>Public content operations</h2></div><Shield size={19} /></div><p>Manage published and restricted public notes and review reports. These admin views use public-note-only service endpoints.</p><div className="admin-shortcut-list"><Link to="/admin/notes"><FileText size={16} />Manage public notes<ArrowRight size={14} /></Link><Link to="/admin/reports"><ShieldAlert size={16} />Review reports<ArrowRight size={14} /></Link><Link to="/admin/moderation"><Shield size={16} />Open moderation<ArrowRight size={14} /></Link></div></article><article className="admin-panel"><div className="admin-panel-heading"><div><p className="admin-eyebrow">SERVICE STATUS</p><h2>API Gateway</h2></div><Activity size={19} /></div><p>{data?.gateway?.status === "running" ? "Gateway health endpoint is responding." : "Gateway health endpoint did not return a successful response."}</p><dl className="admin-dependency-list">{Object.entries(data?.readiness?.dependencies || {}).map(([name, configured]) => <div key={name}><dt>{name}</dt><dd className={configured ? "is-configured" : "is-missing"}>{configured ? "Configured" : "Not configured"}</dd></div>)}</dl><Link to="/admin/health" className="admin-inline-link">View health details <ArrowRight size={14} /></Link></article></section>
    <AdminNotice>Full user administration, audit logs, and platform-wide analytics do not have backing admin APIs in this codebase yet.</AdminNotice>
  </div>;
}

function UnavailablePage({ title, description, endpoint }) {
  return <div className="admin-page"><AdminPageHeader title={title} description={description} /><section className="admin-unavailable"><div><LockKeyhole size={22} /></div><p className="admin-eyebrow">API NOT AVAILABLE</p><h2>This area is not connected yet</h2><p>{endpoint}</p><Link to="/admin/overview" className="admin-button-secondary">Back to overview</Link></section></div>;
}

function PublicNotesPage({ moderation = false }) {
  const [notes, setNotes] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0 });
  const [filter, setFilter] = useState({ status: "", search: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [reason, setReason] = useState("");
  const [moderating, setModerating] = useState(null);
  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(pagination.total / pageSize));

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const params = { page: pagination.page, pageSize, sortBy: "updatedAt", sortOrder: "desc" };
    if (filter.status) params.status = filter.status;
    if (filter.search.trim()) params.search = filter.search.trim();
    try {
      const response = await api.get("/api/notes/admin/public", { params });
      setNotes(response.data.data); setPagination(response.data.pagination);
    } catch (requestError) { setError(getApiError(requestError)); setNotes([]); }
    finally { setLoading(false); }
  }, [filter.search, filter.status, pagination.page]);
  useEffect(() => { const timer = window.setTimeout(load, filter.search ? 250 : 0); return () => window.clearTimeout(timer); }, [filter.search, load]);

  async function submitModeration(note) {
    if (!reason.trim()) return;
    setBusyId(note.id); setError("");
    const action = note.status === "PUBLISHED" ? "restrict" : "restore";
    try {
      await api.post(`/api/notes/admin/${note.id}/${action}`, { reason: reason.trim() });
      setReason(""); setModerating(null); await load();
    } catch (requestError) { setError(getApiError(requestError)); }
    finally { setBusyId(null); }
  }

  const title = moderation ? "Content moderation" : "Public notes management";
  return <div className="admin-page"><AdminPageHeader eyebrow={moderation ? "CONTENT SAFETY" : "PUBLIC CONTENT"} title={title} description={moderation ? "Restrict or restore eligible public notes with a recorded reason." : "Review public notes and their publication state. Private notes are not queried in this view."} action={<button type="button" className="admin-button-secondary" onClick={load} disabled={loading}><RefreshCw size={15} />Refresh</button>} />
    <AdminNotice>All records shown here come from the Notes Service admin public endpoint, which scopes results to public notes.</AdminNotice>
    {error && <div className="admin-error" role="alert">{error}<button type="button" onClick={load}>Try again</button></div>}
    <section className="admin-table-toolbar"><label>Search public notes<input value={filter.search} onChange={(event) => { setFilter((current) => ({ ...current, search: event.target.value })); setPagination((current) => ({ ...current, page: 1 })); }} placeholder="Title or description" /></label><label>Status<select value={filter.status} onChange={(event) => { setFilter((current) => ({ ...current, status: event.target.value })); setPagination((current) => ({ ...current, page: 1 })); }}><option value="">Published and restricted</option><option value="PUBLISHED">Published</option><option value="RESTRICTED">Restricted</option></select></label><span>{pagination.total} public notes</span></section>
    <section className="admin-table-card"><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Note</th><th>Owner ID</th><th>Status</th><th>Updated</th><th>Action</th></tr></thead><tbody>{loading ? <tr><td colSpan="5"><span className="admin-table-loading"><LoaderCircle size={17} className="animate-spin" /> Loading public notes…</span></td></tr> : notes.length === 0 ? <tr><td colSpan="5" className="admin-table-empty">No public notes found.</td></tr> : notes.map((note) => <tr key={note.id}><td><strong>{note.title}</strong><p>{note.description || "No description"}</p><div>{note.categories?.map((category) => <span className="admin-chip" key={category.id}>{category.name}</span>)}{note.tags?.map((tag) => <span className="admin-chip" key={tag.id}>#{tag.name}</span>)}{note.files?.map((file) => <span className="admin-chip" key={file.id}>{file.originalFilename}</span>)}</div></td><td><code>{note.ownerId}</code></td><td><span className={`admin-status is-${note.status?.toLowerCase()}`}>{note.status}</span></td><td>{new Date(note.updatedAt).toLocaleDateString()}</td><td><button type="button" className={note.status === "PUBLISHED" ? "admin-action-danger" : "admin-action-primary"} onClick={() => { setModerating(note); setReason(""); }} disabled={busyId === note.id}>{note.status === "PUBLISHED" ? "Restrict" : "Restore"}</button></td></tr>)}</tbody></table></div><footer className="admin-table-pagination"><span>Page {pagination.page} of {totalPages}</span><div><button type="button" onClick={() => setPagination((current) => ({ ...current, page: current.page - 1 }))} disabled={pagination.page <= 1}>Previous</button><button type="button" onClick={() => setPagination((current) => ({ ...current, page: current.page + 1 }))} disabled={pagination.page >= totalPages}>Next</button></div></footer></section>
    {moderating && <div className="admin-modal-backdrop" role="presentation"><form className="admin-modal" onSubmit={(event) => { event.preventDefault(); submitModeration(moderating); }}><div><div><p className="admin-eyebrow">{moderating.status === "PUBLISHED" ? "RESTRICT PUBLIC NOTE" : "RESTORE PUBLIC NOTE"}</p><h2>{moderating.title}</h2></div><button type="button" className="admin-modal-close" onClick={() => setModerating(null)} aria-label="Close"><X size={17} /></button></div><p>{moderating.status === "PUBLISHED" ? "This removes the note from eligible public feeds and search." : "This makes the public note eligible for feeds and search again."}</p><label>Reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} rows={4} required placeholder="Record the moderation reason (required)" /></label><footer><button type="button" className="admin-button-secondary" onClick={() => setModerating(null)}>Cancel</button><button type="submit" className="admin-button-primary" disabled={!reason.trim() || busyId === moderating.id}>{busyId === moderating.id && <LoaderCircle size={14} className="animate-spin" />}{moderating.status === "PUBLISHED" ? "Restrict note" : "Restore note"}</button></footer></form></div>}
  </div>;
}

function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/api/users/admin/users", {
        params: { page: pagination.page, pageSize: pagination.pageSize, ...(search.trim() ? { search: search.trim() } : {}) },
      });
      setUsers(response.data.data);
      setPagination(response.data.pagination);
    } catch (requestError) {
      setError(getApiError(requestError));
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize, search]);

  useEffect(() => {
    const timer = window.setTimeout(load, search.trim() ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [load, search]);

  async function viewUser(userId) {
    setError("");
    try {
      const response = await api.get(`/api/users/admin/users/${encodeURIComponent(userId)}`);
      setSelectedUser(response.data.data);
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  }

  async function setStatus(target, status) {
    setBusyId(target.id);
    setError("");
    try {
      const response = await api.patch(`/api/users/admin/users/${encodeURIComponent(target.id)}/status`, { status });
      const updatedUser = response.data.data;
      setUsers((current) => current.map((item) => item.id === target.id ? updatedUser : item));
      setSelectedUser((current) => current?.id === target.id ? updatedUser : current);
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setBusyId(null);
    }
  }

  const pageCount = Math.max(1, pagination.totalPages || Math.ceil(pagination.total / pagination.pageSize));
  return <div className="admin-page">
    <AdminPageHeader title="User management" description="Search accounts and manage account access. Passwords and authentication tokens are never returned by this API." action={<button type="button" className="admin-button-secondary" onClick={load} disabled={loading}><RefreshCw size={15} />Refresh</button>} />
    {error && <div className="admin-error" role="alert">{error}<button type="button" onClick={load}>Try again</button></div>}
    <section className="admin-table-toolbar"><label>Search users<input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPagination((current) => ({ ...current, page: 1 })); }} placeholder="Name or email" /></label><span>{pagination.total} users</span></section>
    <section className="admin-table-card"><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>User</th><th>Role</th><th>Account status</th><th>Joined</th><th>Actions</th></tr></thead><tbody>
      {loading ? <tr><td colSpan="5"><span className="admin-table-loading"><LoaderCircle size={17} className="animate-spin" /> Loading users…</span></td></tr> : users.length === 0 ? <tr><td colSpan="5" className="admin-table-empty">No users match this search.</td></tr> : users.map((account) => <tr key={account.id}><td><strong>{account.name}</strong><p>{account.email}</p></td><td><span className="admin-chip">{account.role}</span></td><td><span className={`admin-status is-${account.status?.toLowerCase()}`}>{account.status}</span></td><td>{new Date(account.createdAt).toLocaleDateString()}</td><td><div className="admin-user-actions"><button type="button" className="admin-button-secondary" onClick={() => viewUser(account.id)}>View</button>{account.id !== currentUser?.id && <button type="button" className={account.status === "ACTIVE" ? "admin-action-danger" : "admin-action-primary"} disabled={busyId === account.id} onClick={() => setStatus(account, account.status === "ACTIVE" ? "FROZEN" : "ACTIVE")}>{busyId === account.id ? "Saving…" : account.status === "ACTIVE" ? "Freeze" : "Restore"}</button>}</div></td></tr>)}
    </tbody></table></div><footer className="admin-table-pagination"><span>Page {pagination.page} of {pageCount}</span><div><button type="button" onClick={() => setPagination((current) => ({ ...current, page: current.page - 1 }))} disabled={loading || pagination.page <= 1}>Previous</button><button type="button" onClick={() => setPagination((current) => ({ ...current, page: current.page + 1 }))} disabled={loading || pagination.page >= pageCount}>Next</button></div></footer></section>
    {selectedUser && <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedUser(null); }}><section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-user-detail-title"><div><div><p className="admin-eyebrow">PERMITTED ACCOUNT DETAILS</p><h2 id="admin-user-detail-title">{selectedUser.name}</h2></div><button type="button" className="admin-modal-close" onClick={() => setSelectedUser(null)} aria-label="Close"><X size={17} /></button></div><dl className="admin-user-details"><div><dt>Email</dt><dd>{selectedUser.email}</dd></div><div><dt>Role</dt><dd>{selectedUser.role}</dd></div><div><dt>Status</dt><dd>{selectedUser.status}</dd></div><div><dt>Joined</dt><dd>{new Date(selectedUser.createdAt).toLocaleString()}</dd></div></dl><footer><button type="button" className="admin-button-secondary" onClick={() => setSelectedUser(null)}>Close</button></footer></section></div>}
  </div>;
}

function AdminReports() {
  const [reports, setReports] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0 });
  const [status, setStatus] = useState("OPEN");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const pageSize = 20;
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = { page: pagination.page, pageSize };
      if (status) params.status = status;
      const response = await api.get("/api/notes/admin/reports", { params });
      setReports(response.data.data); setPagination(response.data.pagination);
    } catch (requestError) { setError(getApiError(requestError)); setReports([]); }
    finally { setLoading(false); }
  }, [pagination.page, status]);
  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer); }, [load]);

  async function updateReport(report, nextStatus) {
    setBusyId(report.id); setError("");
    try {
      await api.patch(`/api/notes/admin/reports/${report.id}`, { status: nextStatus });
      setReports((current) => current.map((item) => item.id === report.id ? { ...item, status: nextStatus } : item));
      if (status && status !== nextStatus) { setReports((current) => current.filter((item) => item.id !== report.id)); setPagination((current) => ({ ...current, total: Math.max(0, current.total - 1) })); }
    } catch (requestError) { setError(getApiError(requestError)); }
    finally { setBusyId(null); }
  }

  return <div className="admin-page"><AdminPageHeader title="Public note reports" description="Review reports for public notes. The service excludes reports attached to private notes." action={<button type="button" className="admin-button-secondary" onClick={load} disabled={loading}><RefreshCw size={15} />Refresh</button>} />
    <AdminNotice>Report queries are scoped by the Notes Service to notes with PUBLIC visibility.</AdminNotice>{error && <div className="admin-error" role="alert">{error}<button type="button" onClick={load}>Try again</button></div>}
    <div className="admin-table-toolbar"><label>Report status<select value={status} onChange={(event) => { setStatus(event.target.value); setPagination((current) => ({ ...current, page: 1 })); }}><option value="OPEN">Open</option><option value="REVIEWED">Reviewed</option><option value="DISMISSED">Dismissed</option><option value="">All statuses</option></select></label><span>{pagination.total} reports</span></div>
    <section className="admin-report-list">{loading ? <div className="admin-table-loading"><LoaderCircle size={17} className="animate-spin" /> Loading reports…</div> : reports.length === 0 ? <div className="admin-table-empty">No public-note reports in this view.</div> : reports.map((report) => <article className="admin-report-card" key={report.id}><header><div><span className={`admin-status is-${report.status.toLowerCase()}`}>{report.status}</span><time>{new Date(report.createdAt).toLocaleString()}</time></div><code>Report {report.id}</code></header><h2>{report.note?.title || "Public note"}</h2><p className="admin-report-note-excerpt">{report.note?.description}</p><blockquote>{report.reason}</blockquote><footer><span>Reporter <code>{report.reporterId}</code></span>{report.status === "OPEN" && <div><button type="button" className="admin-button-secondary" disabled={busyId === report.id} onClick={() => updateReport(report, "DISMISSED")}>Dismiss</button><button type="button" className="admin-button-primary" disabled={busyId === report.id} onClick={() => updateReport(report, "REVIEWED")}>{busyId === report.id ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}Mark reviewed</button></div>}</footer></article>)}<footer className="admin-table-pagination"><span>Page {pagination.page} of {Math.max(1, Math.ceil(pagination.total / pageSize))}</span><div><button type="button" onClick={() => setPagination((current) => ({ ...current, page: current.page - 1 }))} disabled={pagination.page <= 1}>Previous</button><button type="button" onClick={() => setPagination((current) => ({ ...current, page: current.page + 1 }))} disabled={pagination.page >= Math.max(1, Math.ceil(pagination.total / pageSize))}>Next</button></div></footer></section>
  </div>;
}

function AdminAnnouncements() {
  const [announcements, setAnnouncements] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const response = await api.get("/api/notifications/announcements", { params: { page: pagination.page, pageSize: 20 } }); setAnnouncements(response.data.data); setPagination(response.data.pagination); }
    catch (requestError) { setError(getApiError(requestError)); }
    finally { setLoading(false); }
  }, [pagination.page]);
  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer); }, [load]);
  return <div className="admin-page"><AdminPageHeader title="Announcements" description="Review published platform announcements." action={<button type="button" className="admin-button-secondary" onClick={load} disabled={loading}><RefreshCw size={15} />Refresh</button>} />
    <AdminNotice tone="warning">The Notification Service exposes a published-announcements read endpoint, but this project has no admin create, edit, or delete endpoint for announcements.</AdminNotice>{error && <div className="admin-error" role="alert">{error}<button type="button" onClick={load}>Try again</button></div>}
    <section className="admin-announcement-list">{loading ? <div className="admin-table-loading"><LoaderCircle size={17} className="animate-spin" /> Loading announcements…</div> : announcements.length === 0 ? <div className="admin-table-empty">No published announcements are available.</div> : announcements.map((item) => <article className="admin-announcement-card" key={item.id}><p className="admin-eyebrow">PUBLISHED {item.publishedAt ? new Date(item.publishedAt).toLocaleDateString() : ""}</p><h2>{item.title}</h2><p>{item.message}</p></article>)}<footer className="admin-table-pagination"><span>{pagination.total} published announcements</span><div><button type="button" onClick={() => setPagination((current) => ({ ...current, page: current.page - 1 }))} disabled={pagination.page <= 1}>Previous</button><button type="button" onClick={() => setPagination((current) => ({ ...current, page: current.page + 1 }))} disabled={pagination.page >= Math.max(1, Math.ceil(pagination.total / 20))}>Next</button></div></footer></section>
  </div>;
}

function AdminAnalytics() {
  const overview = useAdminOverview();
  return <div className="admin-page"><AdminPageHeader title="System analytics" description="Available service data is limited to public notes, public-note reports, announcements, and gateway configuration." action={<button type="button" className="admin-button-secondary" onClick={overview.load} disabled={overview.loading}><RefreshCw size={15} />Refresh</button>} />{overview.error && <AdminNotice tone="warning">{overview.error}</AdminNotice>}<AdminNotice tone="warning">No system-wide analytics or audit API is configured. These figures describe only public-note administration data.</AdminNotice><section className="admin-metric-grid">{overview.loading ? Array.from({ length: 3 }, (_, index) => <div className="admin-metric-skeleton" key={index} />) : <><MetricCard label="Published public notes" value={overview.data?.publicNotes} icon={FileText} detail="Includes published and restricted" /><MetricCard label="Public-note reports" value={overview.data?.reports} icon={ShieldAlert} tone="amber" detail="All report statuses" /><MetricCard label="Announcements" value={overview.data?.announcements} icon={Bell} tone="blue" detail="Published only" /></>}</section></div>;
}

function AdminHealth() {
  const [health, setHealth] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setErrors([]);
    const [healthResult, readyResult] = await Promise.allSettled([api.get("/health"), api.get("/ready")]);
    setHealth(healthResult.status === "fulfilled" ? healthResult.value.data : null);
    setReadiness(readyResult.status === "fulfilled" ? readyResult.value.data : null);
    setErrors([healthResult, readyResult].filter((result) => result.status === "rejected").map((result) => getApiError(result.reason)));
    setLoading(false);
  }, []);
  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer); }, [load]);
  return <div className="admin-page"><AdminPageHeader title="Service health" description="Gateway health and readiness checks available through the API Gateway." action={<button type="button" className="admin-button-secondary" onClick={load} disabled={loading}><RefreshCw size={15} />Refresh</button>} />{errors.map((error) => <div className="admin-error" role="alert" key={error}>{error}</div>)}<section className="admin-health-cards"><article className="admin-panel"><p className="admin-eyebrow">GATEWAY HEALTH</p><h2 className={health?.status === "running" ? "is-healthy" : "is-unhealthy"}>{loading ? "Checking…" : health?.status || "Unavailable"}</h2><p>{health?.service || "API Gateway health endpoint"}</p></article><article className="admin-panel"><p className="admin-eyebrow">GATEWAY READINESS</p><h2 className={readiness?.success ? "is-healthy" : "is-unhealthy"}>{loading ? "Checking…" : readiness?.success ? "Configured" : "Not ready"}</h2><p>Readiness reports whether upstream URLs are configured. It does not probe each service’s live health.</p></article></section><section className="admin-panel"><div className="admin-panel-heading"><div><p className="admin-eyebrow">DEPENDENCIES</p><h2>Configured upstream URLs</h2></div><Activity size={19} /></div>{readiness?.dependencies ? <dl className="admin-dependency-list">{Object.entries(readiness.dependencies).map(([name, configured]) => <div key={name}><dt>{name}</dt><dd className={configured ? "is-configured" : "is-missing"}>{configured ? "Configured" : "Not configured"}</dd></div>)}</dl> : <p className="admin-muted">Dependency configuration is unavailable.</p>}</section><AdminNotice tone="warning">The API Gateway does not expose service-by-service health probes. No direct microservice calls are made from the browser.</AdminNotice></div>;
}

function AdminRouter() {
  return <AdminAccessGate />;
}

export {
  AdminAccessGate,
  AdminAnnouncements,
  AdminAnalytics,
  AdminHealth,
  AdminLayout,
  AdminOverview,
  AdminReports,
  AdminUsers,
  AdminRouter,
  PublicNotesPage,
  UnavailablePage,
};
