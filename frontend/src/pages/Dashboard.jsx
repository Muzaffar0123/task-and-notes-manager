import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowRight,
  Bell,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileText,
  ListTodo,
  CircleDashed,
  UsersRound,
} from "lucide-react";

import StatCard from "../components/ui/StatCard";
import { useAuth } from "../context/useAuth";
import api, { getApiError } from "../services/api";

const statusStyles = {
  IN_PROGRESS: "status-progress",
  PENDING: "status-pending",
  COMPLETED: "status-completed",
};

function formatStatus(status) {
  return {
    PENDING: "Pending",
    IN_PROGRESS: "In Progress",
    COMPLETED: "Completed",
  }[status] || status;
}

function formatPriority(priority) {
  return priority?.charAt(0) + priority?.slice(1).toLowerCase();
}

function StatusBadge({ status }) {
  return <span className={`dashboard-status ${statusStyles[status] || "status-pending"}`}>{formatStatus(status)}</span>;
}

function formatDate(value, options = { month: "short", day: "numeric" }) {
  if (!value) return "No date";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "No date" : date.toLocaleDateString(undefined, options);
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function buildWeeklyActivity(tasks) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    const key = dateKey(date);
    return {
      key,
      label: date.toLocaleDateString(undefined, { weekday: "short" }),
      count: tasks.filter((task) => {
        if (!task.createdAt) return false;
        const createdAt = new Date(task.createdAt);
        return !Number.isNaN(createdAt.getTime()) && dateKey(createdAt) === key;
      }).length,
    };
  });
}

function LoadingRows() {
  return (
    <div className="dashboard-skeleton-list" aria-label="Loading dashboard data">
      <span />
      <span />
      <span />
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState({});
  const [loading, setLoading] = useState(true);
  const [failedSections, setFailedSections] = useState([]);

  useEffect(() => {
    let active = true;

    const requests = [
      ["tasks", api.get("/api/tasks")],
      ["taskStats", api.get("/api/tasks/statistics")],
      ["notes", api.get("/api/notes/mine", { params: { page: 1, pageSize: 1 } })],
      ["followers", api.get("/api/social/follows/followers", { params: { page: 1, pageSize: 1 }, timeout: 5000 })],
      ["following", api.get("/api/social/follows/following", { params: { page: 1, pageSize: 1 }, timeout: 5000 })],
      ["notifications", api.get("/api/notifications", { params: { page: 1, pageSize: 5 } })],
      ["unread", api.get("/api/notifications/unread-count")],
    ];

    Promise.all(requests.map(async ([key, request]) => {
      try {
        return [key, { data: (await request).data }];
      } catch (error) {
        return [key, { error: getApiError(error) }];
      }
    })).then((results) => {
      if (!active) return;
      const nextDashboard = {};
      const failures = [];
      for (const [key, result] of results) {
        nextDashboard[key] = result.data ?? null;
        if (result.error) failures.push({ key, message: result.error });
      }
      setDashboard(nextDashboard);
      setFailedSections(failures);
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  const tasks = dashboard.tasks?.data || [];
  const stats = dashboard.taskStats?.data || {};
  const counts = {
    total: stats.total ?? dashboard.tasks?.count ?? tasks.length,
    pending: stats.pending ?? tasks.filter((task) => task.status === "PENDING").length,
    inProgress: stats.inProgress ?? tasks.filter((task) => task.status === "IN_PROGRESS").length,
    completed: stats.completed ?? tasks.filter((task) => task.status === "COMPLETED").length,
    overdue: stats.overdue ?? null,
  };
  const recentTasks = [...tasks]
    .sort((left, right) => new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0))
    .slice(0, 5);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcomingTasks = tasks
    .filter((task) => task.status !== "COMPLETED" && task.dueDate && new Date(task.dueDate) >= today)
    .sort((left, right) => new Date(left.dueDate) - new Date(right.dueDate))
    .slice(0, 4);
  const weeklyActivity = buildWeeklyActivity(tasks);
  const maxActivity = Math.max(1, ...weeklyActivity.map((day) => day.count));
  const taskTotal = Number(counts.total) || 0;
  const taskMix = [
    { key: "completed", label: "Completed", value: Number(counts.completed) || 0, className: "mix-completed" },
    { key: "inProgress", label: "In progress", value: Number(counts.inProgress) || 0, className: "mix-progress" },
    { key: "pending", label: "Pending", value: Number(counts.pending) || 0, className: "mix-pending" },
  ];
  const statistics = [
    {
      title: "Total tasks",
      value: dashboard.tasks ? counts.total : "—",
      description: "Across your workspace",
      icon: ListTodo,
      color: "stat-teal",
    },
    {
      title: "Completed",
      value: dashboard.taskStats || dashboard.tasks ? counts.completed : "—",
      description: "Tasks finished",
      icon: CheckCircle2,
      color: "stat-green",
    },
    {
      title: "In progress",
      value: dashboard.taskStats || dashboard.tasks ? counts.inProgress : "—",
      description: "Currently underway",
      icon: Clock3,
      color: "stat-blue",
    },
    {
      title: "Pending",
      value: dashboard.taskStats || dashboard.tasks ? counts.pending : "—",
      description: "Waiting to start",
      icon: CircleDashed,
      color: "stat-amber",
    },
    {
      title: "Overdue",
      value: dashboard.taskStats ? counts.overdue : "—",
      description: "Need your attention",
      icon: Clock3,
      color: "stat-coral",
    },
    {
      title: "Notes",
      value: dashboard.notes?.pagination?.total ?? "—",
      description: "Your saved notes",
      icon: FileText,
      color: "stat-blue",
    },
    {
      title: "Followers",
      value: dashboard.followers?.pagination?.total ?? "—",
      description: "People following you",
      icon: UsersRound,
      color: "stat-green",
    },
    {
      title: "Following",
      value: dashboard.following?.pagination?.total ?? "—",
      description: "People you follow",
      icon: UsersRound,
      color: "stat-teal",
    },
    {
      title: "Unread",
      value: dashboard.unread?.count ?? "—",
      description: "Notifications to review",
      icon: Bell,
      color: "stat-amber",
    },
  ];

  return (
    <div className="dashboard-page">
      <section className="dashboard-welcome">
        <div>
          <p className="dashboard-kicker">PERSONAL OVERVIEW</p>
          <h2>Good to see you, {user?.name?.split(" ")[0] || "there"}.</h2>
          <p className="dashboard-welcome-copy">Your work, notes, and activity at a glance.</p>
        </div>
        <div className="dashboard-date">{formatDate(new Date(), { weekday: "long", month: "long", day: "numeric" })}</div>
      </section>

      {failedSections.length > 0 && (
        <div className="dashboard-partial-error" role="status">
          Some dashboard data is unavailable. Sections with missing data are shown as dashes.
        </div>
      )}

      <section className="dashboard-stat-grid" aria-label="Workspace statistics">
        {loading
          ? Array.from({ length: 8 }, (_, index) => <div className="dashboard-stat-placeholder" key={index} />)
          : statistics.map((stat) => <StatCard key={stat.title} {...stat} />)}
      </section>

      <section className="dashboard-analytics-grid">
        <article className="dashboard-panel task-mix-panel">
          <div className="dashboard-panel-heading">
            <div><p className="dashboard-kicker">WORKLOAD</p><h3>Task status mix</h3></div>
            <span className="dashboard-panel-number">{dashboard.tasks ? taskTotal : "—"}</span>
          </div>
          {loading ? <LoadingRows /> : dashboard.tasks ? (
            <>
              <div className="task-mix-track" role="img" aria-label={`Task status mix: ${counts.completed} completed, ${counts.inProgress} in progress, ${counts.pending} pending`}>
                {taskMix.map((segment) => (
                  <span key={segment.key} className={segment.className} style={{ width: `${taskTotal ? (segment.value / taskTotal) * 100 : 0}%` }} />
                ))}
              </div>
              <div className="task-mix-legend">
                {taskMix.map((segment) => (
                  <div className="task-mix-item" key={segment.key}>
                    <span className={`task-mix-dot ${segment.className}`} />
                    <span>{segment.label}</span>
                    <strong>{segment.value}</strong>
                  </div>
                ))}
              </div>
            </>
          ) : <p className="dashboard-empty-copy">Task statistics are unavailable.</p>}
        </article>

        <article className="dashboard-panel weekly-panel">
          <div className="dashboard-panel-heading">
            <div><p className="dashboard-kicker">LAST 7 DAYS</p><h3>Tasks created</h3></div>
            <ArrowDownRight className="dashboard-panel-icon" size={19} />
          </div>
          {loading ? <LoadingRows /> : dashboard.tasks ? (
            <div className="weekly-bars" role="img" aria-label="Tasks created by day in the last seven days">
              {weeklyActivity.map((day) => (
                <div className="weekly-bar-column" key={day.key} title={`${day.label}: ${day.count} tasks`}>
                  <strong>{day.count || ""}</strong>
                  <div className="weekly-bar-track">
                    <span style={{ height: `${day.count ? Math.max(9, (day.count / maxActivity) * 100) : 3}%` }} />
                  </div>
                  <span className="weekly-bar-label">{day.label}</span>
                </div>
              ))}
            </div>
          ) : <p className="dashboard-empty-copy">Task activity is unavailable.</p>}
        </article>
      </section>

      <section className="dashboard-lists-grid">
        <article className="dashboard-panel recent-tasks-panel">
          <div className="dashboard-panel-heading">
            <div><p className="dashboard-kicker">YOUR WORK</p><h3>Recent tasks</h3></div>
            <Link to="/tasks" className="dashboard-text-link">All tasks <ArrowRight size={15} /></Link>
          </div>
          {loading ? <LoadingRows /> : !dashboard.tasks ? (
            <p className="dashboard-empty-copy">Tasks could not be loaded.</p>
          ) : recentTasks.length === 0 ? (
            <div className="dashboard-empty-state">
              <ListTodo size={24} />
              <p>No tasks yet</p>
              <Link to="/tasks?create=task">Create your first task <ArrowRight size={14} /></Link>
            </div>
          ) : (
            <div className="dashboard-table-wrap">
              <table className="dashboard-table">
                <thead><tr><th>Task</th><th>Due</th><th>Status</th><th>Priority</th></tr></thead>
                <tbody>
                  {recentTasks.map((task) => (
                    <tr key={task.id}>
                      <td><span className="dashboard-task-title">{task.title}</span></td>
                      <td>{task.dueDate ? formatDate(task.dueDate) : "—"}</td>
                      <td><StatusBadge status={task.status} /></td>
                      <td>{formatPriority(task.priority)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <div className="dashboard-side-stack">
          <article className="dashboard-panel deadlines-panel">
            <div className="dashboard-panel-heading">
              <div><p className="dashboard-kicker">UP NEXT</p><h3>Upcoming deadlines</h3></div>
              <CalendarClock className="dashboard-panel-icon" size={19} />
            </div>
            {loading ? <LoadingRows /> : !dashboard.tasks ? (
              <p className="dashboard-empty-copy">Deadlines are unavailable.</p>
            ) : upcomingTasks.length === 0 ? (
              <p className="dashboard-empty-copy">No upcoming deadlines.</p>
            ) : (
              <ul className="deadline-list">
                {upcomingTasks.map((task) => (
                  <li key={task.id}>
                    <span className="deadline-date">{formatDate(task.dueDate)}</span>
                    <span className="deadline-title">{task.title}</span>
                    <StatusBadge status={task.status} />
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="dashboard-panel recent-notifications-panel">
            <div className="dashboard-panel-heading">
              <div><p className="dashboard-kicker">LATEST</p><h3>Notifications</h3></div>
              <Link to="/notifications" className="dashboard-text-link">View <ArrowRight size={15} /></Link>
            </div>
            {loading ? <LoadingRows /> : !dashboard.notifications ? (
              <p className="dashboard-empty-copy">Notifications are unavailable.</p>
            ) : dashboard.notifications.data?.length ? (
              <ul className="dashboard-notification-list">
                {dashboard.notifications.data.slice(0, 3).map((notification) => (
                  <li key={notification.id}>
                    <span className={`notification-read-mark ${notification.isRead ? "is-read" : ""}`} />
                    <span className="dashboard-notification-copy">
                      <strong>{notification.title}</strong>
                      <small>{notification.message}</small>
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="dashboard-empty-copy">No notifications yet.</p>}
          </article>
        </div>
      </section>
    </div>
  );
}
