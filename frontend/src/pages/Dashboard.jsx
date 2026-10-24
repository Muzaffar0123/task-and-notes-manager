import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  Clock3,
  ListTodo,
  CircleDashed,
  ArrowRight,
  LoaderCircle,
} from "lucide-react";

import StatCard from "../components/ui/StatCard";
import api, { getApiError } from "../services/api";

const statusStyles = {
  IN_PROGRESS: "bg-amber-50 text-amber-700",
  PENDING: "bg-slate-100 text-slate-600",
  COMPLETED: "bg-emerald-50 text-emerald-700",
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
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${
        statusStyles[status] || "bg-slate-100 text-slate-600"
      }`}
    >
      {formatStatus(status)}
    </span>
  );
}

export default function Dashboard() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadTasks() {
      try {
        const response = await api.get("/api/tasks");

        if (active) {
          setTasks(response.data.data || []);
        }
      } catch (err) {
        if (active) {
          setError(getApiError(err));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadTasks();

    return () => {
      active = false;
    };
  }, []);

  const statistics = [
    {
      title: "Total Tasks",
      value: tasks.length,
      description: "All tasks in your workspace",
      icon: ListTodo,
      color: "bg-indigo-50 text-indigo-600",
    },
    {
      title: "Completed",
      value: tasks.filter((task) => task.status === "COMPLETED").length,
      description: "Tasks successfully completed",
      icon: CheckCircle2,
      color: "bg-emerald-50 text-emerald-600",
    },
    {
      title: "In Progress",
      value: tasks.filter((task) => task.status === "IN_PROGRESS").length,
      description: "Tasks currently underway",
      icon: Clock3,
      color: "bg-amber-50 text-amber-600",
    },
    {
      title: "Pending",
      value: tasks.filter((task) => task.status === "PENDING").length,
      description: "Tasks waiting to be started",
      icon: CircleDashed,
      color: "bg-rose-50 text-rose-600",
    },
  ];

  const recentTasks = [...tasks]
    .sort(
      (a, b) =>
        new Date(b.updatedAt || b.createdAt || 0) -
        new Date(a.updatedAt || a.createdAt || 0)
    )
    .slice(0, 5);

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-5">
          <h2 className="text-xl font-bold text-slate-900">Overview</h2>
          <p className="mt-1 text-sm text-slate-500">
            Here's a summary of your current workload.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
            <LoaderCircle
              size={30}
              className="mx-auto mb-3 animate-spin text-indigo-600"
            />
            <p className="text-sm text-slate-500">
              Loading your dashboard...
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {statistics.map((stat) => (
              <StatCard key={stat.title} {...stat} />
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Recent Tasks
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Review your latest tasks and their progress.
            </p>
          </div>

          <Link
            to="/tasks"
            className="flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
          >
            View all <ArrowRight size={16} />
          </Link>
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-slate-500">
            Loading tasks...
          </p>
        ) : recentTasks.length === 0 ? (
          <div className="py-10 text-center">
            <ListTodo size={36} className="mx-auto mb-3 text-slate-300" />
            <p className="font-medium text-slate-700">No tasks yet</p>
            <p className="mt-1 text-sm text-slate-500">
              Create your first task from the Tasks page.
            </p>
            <Link
              to="/tasks"
              className="mt-4 inline-flex rounded-xl bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700"
            >
              Open Tasks
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-4 font-semibold">Task</th>
                  <th className="px-3 py-4 font-semibold">Due Date</th>
                  <th className="px-3 py-4 font-semibold">Status</th>
                  <th className="px-3 py-4 font-semibold">Priority</th>
                </tr>
              </thead>

              <tbody>
                {recentTasks.map((task) => (
                  <tr
                    key={task.id}
                    className="border-b border-slate-50 last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-3 py-4 text-sm font-medium text-slate-800">
                      {task.title}
                    </td>

                    <td className="px-3 py-4 text-sm text-slate-500">
                      {task.dueDate
                        ? new Date(task.dueDate).toLocaleDateString()
                        : "Not set"}
                    </td>

                    <td className="px-3 py-4">
                      <StatusBadge status={task.status} />
                    </td>

                    <td className="px-3 py-4 text-sm text-slate-600">
                      {formatPriority(task.priority)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
