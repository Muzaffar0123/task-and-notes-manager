import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowDownUp, CalendarDays, CheckCircle2, CircleDashed, ClipboardList,
  Eye, LoaderCircle, Pencil, Plus, RefreshCw, Search, Trash2, X,
} from "lucide-react";

import TaskForm from "../components/tasks/TaskForm";
import api, { getApiError } from "../services/api";

const PAGE_SIZE = 10;
const statusOptions = [
  ["PENDING", "Pending"],
  ["IN_PROGRESS", "In progress"],
  ["COMPLETED", "Completed"],
];
const priorityOptions = [["LOW", "Low"], ["MEDIUM", "Medium"], ["HIGH", "High"]];

function formatDate(value) {
  if (!value) return "No due date";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "No due date" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatStatus(status) {
  return statusOptions.find(([value]) => value === status)?.[1] || status;
}

function formatPriority(priority) {
  return priorityOptions.find(([value]) => value === priority)?.[1] || priority || "—";
}

function Stat({ label, value, icon: Icon, tone }) {
  return (
    <article className="tasks-stat-card">
      <span className={`tasks-stat-icon ${tone}`}><Icon size={18} aria-hidden="true" /></span>
      <div><p>{label}</p><strong>{value ?? "—"}</strong></div>
    </article>
  );
}

function TaskDetails({ task, onClose }) {
  if (!task) return null;
  return (
    <div className="task-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="task-dialog" role="dialog" aria-modal="true" aria-labelledby="task-detail-title">
        <div className="task-dialog-heading">
          <div><p className="tasks-eyebrow">TASK DETAILS</p><h2 id="task-detail-title">{task.title}</h2></div>
          <button type="button" className="tasks-icon-button" onClick={onClose} aria-label="Close task details"><X size={18} /></button>
        </div>
        <div className="task-detail-badges">
          <span className={`task-badge status-${task.status?.toLowerCase()}`}>{formatStatus(task.status)}</span>
          <span className={`task-badge priority-${task.priority?.toLowerCase()}`}>{formatPriority(task.priority)} priority</span>
        </div>
        <div className="task-detail-description"><h3>Description</h3><p>{task.description || "No description provided."}</p></div>
        <p className="task-detail-date"><CalendarDays size={16} /> Due {formatDate(task.dueDate)}</p>
        <p className="task-detail-date">Created {formatDate(task.createdAt)}</p>
      </section>
    </div>
  );
}

export default function Tasks() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tasks, setTasks] = useState([]);
  const [stats, setStats] = useState(null);
  const [statsUnavailable, setStatsUnavailable] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, pageSize: PAGE_SIZE, total: 0 });
  const [filters, setFilters] = useState({ search: "", status: "", priority: "", sortBy: "createdAt", sortOrder: "desc" });
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [detailTask, setDetailTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
  const createTaskRequested = searchParams.get("create") === "task";
  const taskFormOpen = showForm || createTaskRequested;

  const loadStats = useCallback(async () => {
    try {
      const response = await api.get("/api/tasks/statistics");
      setStats(response.data.data);
      setStatsUnavailable(false);
    } catch {
      setStats(null);
      setStatsUnavailable(true);
    }
  }, []);

  const refreshTasks = useCallback(async () => {
    const params = { page: pagination.page, pageSize: PAGE_SIZE, sortBy: filters.sortBy, sortOrder: filters.sortOrder };
    if (filters.search.trim()) params.search = filters.search.trim();
    if (filters.status) params.status = filters.status;
    if (filters.priority) params.priority = filters.priority;
    const response = await api.get("/api/tasks", { params });
    const result = response.data;
    setTasks(Array.isArray(result.data) ? result.data : []);
    setPagination(result.pagination || { page: 1, pageSize: PAGE_SIZE, total: result.count ?? result.data?.length ?? 0 });
  }, [filters, pagination.page]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params = { page: pagination.page, pageSize: PAGE_SIZE, sortBy: filters.sortBy, sortOrder: filters.sortOrder };
        if (filters.search.trim()) params.search = filters.search.trim();
        if (filters.status) params.status = filters.status;
        if (filters.priority) params.priority = filters.priority;
        const response = await api.get("/api/tasks", { params });
        if (!active) return;
        const result = response.data;
        setTasks(Array.isArray(result.data) ? result.data : []);
        setPagination(result.pagination || { page: 1, pageSize: PAGE_SIZE, total: result.count ?? result.data?.length ?? 0 });
      } catch (loadError) {
        if (active) setError(getApiError(loadError));
      } finally {
        if (active) setLoading(false);
      }
    }, filters.search ? 250 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [filters, pagination.page]);

  useEffect(() => {
    const timer = window.setTimeout(loadStats, 0);
    return () => window.clearTimeout(timer);
  }, [loadStats]);

  function clearCreateTaskRequest() {
    if (!searchParams.has("create")) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("create");
    setSearchParams(nextParams, { replace: true });
  }

  async function reloadAfterMutation() {
    setError("");
    await Promise.all([refreshTasks().catch((loadError) => setError(getApiError(loadError))), loadStats()]);
  }

  async function handleAddTask(taskData) {
    try {
      await api.post("/api/tasks", taskData);
      setShowForm(false);
      setEditingTask(null);
      clearCreateTaskRequest();
      await reloadAfterMutation();
      return { success: true };
    } catch (saveError) {
      return { success: false, message: getApiError(saveError) };
    }
  }

  async function handleUpdateTask(taskData) {
    try {
      await api.patch(`/api/tasks/${taskData.id}`, taskData);
      setShowForm(false);
      setEditingTask(null);
      clearCreateTaskRequest();
      await reloadAfterMutation();
      return { success: true };
    } catch (saveError) {
      return { success: false, message: getApiError(saveError) };
    }
  }

  async function handleStatusChange(task, status) {
    if (task.status === status) return;
    setUpdatingId(task.id);
    setError("");
    try {
      await api.patch(`/api/tasks/${task.id}`, { status });
      await reloadAfterMutation();
    } catch (updateError) {
      setError(getApiError(updateError));
    } finally {
      setUpdatingId(null);
    }
  }

  async function handlePriorityChange(task, priority) {
    if (task.priority === priority) return;
    setUpdatingId(task.id);
    setError("");
    try {
      await api.patch(`/api/tasks/${task.id}`, { priority });
      await reloadAfterMutation();
    } catch (updateError) {
      setError(getApiError(updateError));
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleDeleteTask(taskId) {
    if (!window.confirm("Are you sure you want to delete this task?")) return;
    setDeletingId(taskId);
    setError("");
    try {
      await api.delete(`/api/tasks/${taskId}`);
      if (detailTask?.id === taskId) setDetailTask(null);
      if (editingTask?.id === taskId) { setEditingTask(null); setShowForm(false); }
      await reloadAfterMutation();
    } catch (deleteError) {
      setError(getApiError(deleteError));
    } finally {
      setDeletingId(null);
    }
  }

  async function openDetails(task) {
    setDetailTask({ loading: true, id: task.id });
    try {
      const response = await api.get(`/api/tasks/${task.id}`);
      setDetailTask(response.data.data);
    } catch (detailError) {
      setDetailTask(null);
      setError(getApiError(detailError));
    }
  }

  function changeFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }));
    setPagination((current) => ({ ...current, page: 1 }));
  }

  function closeForm() {
    setShowForm(false);
    setEditingTask(null);
    clearCreateTaskRequest();
  }

  const totalPages = Math.max(1, Math.ceil(pagination.total / PAGE_SIZE));
  const statValues = stats || (statsUnavailable ? null : {});

  return (
    <div className="tasks-page">
      <header className="tasks-page-heading">
        <div><p className="tasks-eyebrow">YOUR WORKSPACE</p><h1>My tasks</h1><p>Plan your work, set priorities, and keep deadlines in view.</p></div>
        <div className="tasks-page-actions">
          <button type="button" className="tasks-secondary-button" onClick={() => { refreshTasks().catch((loadError) => setError(getApiError(loadError))); loadStats(); }} disabled={loading}><RefreshCw size={16} /> Refresh</button>
          <button type="button" className="tasks-primary-button" onClick={() => { if (taskFormOpen) closeForm(); else { setEditingTask(null); setShowForm(true); } }}>
            {taskFormOpen ? <X size={17} /> : <Plus size={17} />}{taskFormOpen ? "Close form" : "Create task"}
          </button>
        </div>
      </header>

      <section className="tasks-stats-grid" aria-label="Task statistics">
        <Stat label="All tasks" value={statValues?.total} icon={ClipboardList} tone="tasks-tone-teal" />
        <Stat label="Pending" value={statValues?.pending} icon={CircleDashed} tone="tasks-tone-amber" />
        <Stat label="In progress" value={statValues?.inProgress} icon={ArrowDownUp} tone="tasks-tone-blue" />
        <Stat label="Completed" value={statValues?.completed} icon={CheckCircle2} tone="tasks-tone-green" />
        <Stat label="Overdue" value={statValues?.overdue} icon={CalendarDays} tone="tasks-tone-coral" />
      </section>

      {statsUnavailable && <p className="tasks-inline-note" role="status">Task statistics are unavailable right now.</p>}
      {error && <div className="tasks-error" role="alert"><span>{error}</span><button type="button" onClick={() => { refreshTasks().catch((loadError) => setError(getApiError(loadError))); loadStats(); }}>Try again</button></div>}

      {taskFormOpen && <TaskForm key={editingTask?.id ?? "new-task"} editingTask={editingTask} onAddTask={handleAddTask} onUpdateTask={handleUpdateTask} onCancel={closeForm} />}

      <section className="tasks-toolbar" aria-label="Search and filter tasks">
        <label className="tasks-search"><Search size={17} aria-hidden="true" /><input type="search" value={filters.search} onChange={(event) => changeFilter("search", event.target.value)} placeholder="Search tasks..." aria-label="Search tasks" /></label>
        <label className="tasks-filter">Status<select value={filters.status} onChange={(event) => changeFilter("status", event.target.value)}><option value="">All statuses</option>{statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="tasks-filter">Priority<select value={filters.priority} onChange={(event) => changeFilter("priority", event.target.value)}><option value="">All priorities</option>{priorityOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="tasks-filter">Sort by<select value={`${filters.sortBy}:${filters.sortOrder}`} onChange={(event) => { const [sortBy, sortOrder] = event.target.value.split(":"); setFilters((current) => ({ ...current, sortBy, sortOrder })); setPagination((current) => ({ ...current, page: 1 })); }}><option value="createdAt:desc">Newest</option><option value="createdAt:asc">Oldest</option><option value="dueDate:asc">Due date</option><option value="title:asc">Title A–Z</option><option value="priority:desc">Priority</option><option value="status:asc">Status</option></select></label>
      </section>

      {loading ? <div className="tasks-list-card" aria-label="Loading tasks"><div className="tasks-skeleton-header" />{Array.from({ length: 5 }, (_, index) => <div className="tasks-skeleton-row" key={index}><span /><span /><span /><span /></div>)}</div>
        : error && tasks.length === 0 ? <div className="tasks-empty-card"><ClipboardList size={36} /><h2>Tasks could not be loaded</h2><p>Check your connection and try again.</p><button type="button" className="tasks-secondary-button" onClick={() => refreshTasks().catch((loadError) => setError(getApiError(loadError)))}>Try again</button></div>
          : tasks.length === 0 ? <div className="tasks-empty-card"><ClipboardList size={36} /><h2>{pagination.total === 0 ? "No tasks yet" : "No tasks match these filters"}</h2><p>{pagination.total === 0 ? "Create a task to make a clear next step." : "Adjust your search or filters to see more tasks."}</p>{pagination.total === 0 && <button type="button" className="tasks-primary-button" onClick={() => setShowForm(true)}><Plus size={16} /> Create task</button>}</div>
            : <section className="tasks-list-card" aria-label="Tasks">
              <div className="tasks-list-heading"><div><h2>Task list</h2><p>{pagination.total} {pagination.total === 1 ? "task" : "tasks"} found</p></div></div>
              <div className="tasks-table-wrap"><table className="tasks-table"><thead><tr><th>Task</th><th>Due date</th><th>Priority</th><th>Status</th><th>Actions</th></tr></thead><tbody>
                {tasks.map((task) => <tr key={task.id}>
                  <td><strong className="tasks-title">{task.title}</strong><span className="tasks-description">{task.description || "No description provided."}</span></td>
                  <td><span className="tasks-due-date">{formatDate(task.dueDate)}</span></td>
                  <td><select className={`tasks-inline-select task-badge priority-${task.priority?.toLowerCase()}`} value={task.priority} onChange={(event) => handlePriorityChange(task, event.target.value)} disabled={updatingId === task.id} aria-label={`Change priority for ${task.title}`}>{priorityOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
                  <td><select className={`tasks-inline-select task-badge status-${task.status?.toLowerCase()}`} value={task.status} onChange={(event) => handleStatusChange(task, event.target.value)} disabled={updatingId === task.id} aria-label={`Change status for ${task.title}`}>{statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
                  <td><div className="tasks-row-actions"><button type="button" className="tasks-icon-button" onClick={() => openDetails(task)} aria-label={`View ${task.title}`}><Eye size={16} /></button><button type="button" className="tasks-icon-button" onClick={() => { setEditingTask(task); setShowForm(true); }} aria-label={`Edit ${task.title}`}><Pencil size={16} /></button><button type="button" className="tasks-icon-button is-danger" onClick={() => handleDeleteTask(task.id)} disabled={deletingId === task.id} aria-label={`Delete ${task.title}`}>{deletingId === task.id ? <LoaderCircle size={16} className="animate-spin" /> : <Trash2 size={16} />}</button></div></td>
                </tr>)}
              </tbody></table></div>
              <footer className="tasks-pagination"><span>Page {pagination.page} of {totalPages}</span><div><button type="button" className="tasks-secondary-button" onClick={() => setPagination((current) => ({ ...current, page: current.page - 1 }))} disabled={pagination.page <= 1}>Previous</button><button type="button" className="tasks-secondary-button" onClick={() => setPagination((current) => ({ ...current, page: current.page + 1 }))} disabled={pagination.page >= totalPages}>Next</button></div></footer>
            </section>}
      {detailTask?.loading ? <div className="task-dialog-backdrop"><section className="task-dialog" role="status"><LoaderCircle className="animate-spin" /> Loading task details...</section></div> : <TaskDetails task={detailTask} onClose={() => setDetailTask(null)} />}
    </div>
  );
}
