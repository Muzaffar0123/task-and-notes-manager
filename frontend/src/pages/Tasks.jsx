import { useEffect, useState } from "react";
import {
  Plus,
  Search,
  ClipboardList,
  X,
  Pencil,
  Trash2,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";

import TaskForm from "../components/tasks/TaskForm";
import api, { getApiError } from "../services/api";

const priorityStyles = {
  HIGH: "bg-red-100 text-red-700",
  MEDIUM: "bg-amber-100 text-amber-700",
  LOW: "bg-green-100 text-green-700",
};

const statusStyles = {
  PENDING: "bg-slate-100 text-slate-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
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

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const [updatingStatusId, setUpdatingStatusId] = useState(null);

  async function loadTasks() {
    setLoading(true);
    setError("");

    try {
      const response = await api.get("/api/tasks");
      setTasks(response.data.data || []);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTasks();
  }, []);

  async function handleAddTask(taskData) {
    try {
      const response = await api.post("/api/tasks", taskData);
      const newTask = response.data.data;

      setTasks((previous) => [
        newTask,
        ...previous.filter((task) => task.id !== newTask.id),
      ]);

      setShowForm(false);
      setEditingTask(null);
      setError("");
      return { success: true };
    } catch (err) {
      return { success: false, message: getApiError(err) };
    }
  }

  async function handleUpdateTask(taskData) {
    try {
      const response = await api.patch(
        `/api/tasks/${taskData.id}`,
        taskData
      );

      const updatedTask = response.data.data;

      setTasks((previous) =>
        previous.map((task) =>
          task.id === updatedTask.id ? updatedTask : task
        )
      );

      setShowForm(false);
      setEditingTask(null);
      setError("");
      return { success: true };
    } catch (err) {
      return { success: false, message: getApiError(err) };
    }
  }
  async function handleStatusChange(task, newStatus) {
    if (task.status === newStatus) return;

    setUpdatingStatusId(task.id);
    setError("");

    try {
      const response = await api.patch(`/api/tasks/${task.id}`, {
        status: newStatus,
      });

      const updatedTask = response.data.data;

      setTasks((previous) =>
        previous.map((item) =>
          item.id === updatedTask.id ? updatedTask : item
        )
      );
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setUpdatingStatusId(null);
    }
  }

  async function handleDeleteTask(taskId) {
    const shouldDelete = window.confirm(
      "Are you sure you want to delete this task?"
    );

    if (!shouldDelete) return;

    setDeletingId(taskId);
    setError("");

    try {
      await api.delete(`/api/tasks/${taskId}`);

      setTasks((previous) =>
        previous.filter((task) => task.id !== taskId)
      );

      if (editingTask?.id === taskId) {
        setEditingTask(null);
        setShowForm(false);
      }
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setDeletingId(null);
    }
  }

  function handleEditTask(task) {
    setEditingTask(task);
    setShowForm(true);
  }

  function handleCloseForm() {
    setShowForm(false);
    setEditingTask(null);
  }

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredTasks = tasks.filter((task) => {
    return (
      task.title?.toLowerCase().includes(normalizedSearch) ||
      task.description?.toLowerCase().includes(normalizedSearch)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Tasks</h1>
          <p className="mt-1 text-sm text-slate-500">
            Create, organize, and track your daily tasks.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={loadTasks}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={17} />
            Refresh
          </button>

          <button
            type="button"
            onClick={() => {
              if (showForm) {
                handleCloseForm();
              } else {
                setEditingTask(null);
                setShowForm(true);
              }
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white transition hover:bg-indigo-700"
          >
            {showForm ? <X size={18} /> : <Plus size={18} />}
            {showForm ? "Close Form" : "Create Task"}
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between"
        >
          <p>{error}</p>
          <button
            type="button"
            onClick={loadTasks}
            className="shrink-0 font-semibold underline"
          >
            Try again
          </button>
        </div>
      )}

      {showForm && (
        <TaskForm
          key={editingTask?.id ?? "new-task"}
          editingTask={editingTask}
          onAddTask={handleAddTask}
          onUpdateTask={handleUpdateTask}
          onCancel={handleCloseForm}
        />
      )}

      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">Total tasks</p>
          <p className="text-2xl font-bold text-slate-900">
            {tasks.length}
          </p>
        </div>

        <div className="relative w-full sm:max-w-sm">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search tasks..."
            aria-label="Search tasks"
            className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-4 outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <LoaderCircle
            size={32}
            className="mx-auto mb-3 animate-spin text-indigo-600"
          />
          <p className="text-sm text-slate-500">Loading your tasks...</p>
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <ClipboardList
            size={40}
            className="mx-auto mb-3 text-slate-400"
          />
          <h2 className="font-semibold text-slate-800">
            {tasks.length === 0 ? "No tasks yet" : "No tasks found"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {tasks.length === 0
              ? "Create your first task to get started."
              : "Try another search term."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Task
                  </th>
                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Priority
                  </th>
                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Status
                  </th>
                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredTasks.map((task) => (
                  <tr key={task.id} className="transition hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <p className="font-semibold text-slate-800">
                        {task.title}
                      </p>
                      <p className="mt-1 max-w-md text-sm text-slate-500">
                        {task.description || "No description provided."}
                      </p>
                      {task.dueDate && (
                        <p className="mt-1 text-xs text-slate-400">
                          Due: {new Date(task.dueDate).toLocaleDateString()}
                        </p>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      <select
                        value={task.status}
                        onChange={(event) =>
                          handleStatusChange(task, event.target.value)
                        }
                        disabled={updatingStatusId === task.id}
                        aria-label={`Change status for ${task.title}`}
                        className={`rounded-lg border-0 px-3 py-2 text-xs font-semibold outline-none ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-indigo-500 disabled:cursor-wait disabled:opacity-60 ${statusStyles[task.status] || "bg-slate-100 text-slate-700"
                          }`}
                      >
                        <option value="PENDING">Pending</option>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="COMPLETED">Completed</option>
                      </select>

                      {updatingStatusId === task.id && (
                        <LoaderCircle
                          size={14}
                          className="ml-2 inline animate-spin text-indigo-600"
                          aria-label="Updating status"
                        />
                      )}
                    </td>

                    <td className="px-6 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[task.status] ||
                          "bg-slate-100 text-slate-700"
                          }`}
                      >
                        {formatStatus(task.status)}
                      </span>
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleEditTask(task)}
                          aria-label={`Edit ${task.title}`}
                          className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50"
                        >
                          <Pencil size={17} />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteTask(task.id)}
                          disabled={deletingId === task.id}
                          aria-label={`Delete ${task.title}`}
                          className="rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          {deletingId === task.id ? (
                            <LoaderCircle size={17} className="animate-spin" />
                          ) : (
                            <Trash2 size={17} />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
