import { useState } from "react";
import { LoaderCircle } from "lucide-react";

const initialFormData = {
  title: "",
  description: "",
  priority: "MEDIUM",
  status: "PENDING",
  dueDate: "",
};

function toDateInputValue(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export default function TaskForm({
  onAddTask,
  onUpdateTask,
  onCancel,
  editingTask = null,
}) {
  const [formData, setFormData] = useState(() => ({
    ...initialFormData,
    title: editingTask?.title ?? "",
    description: editingTask?.description ?? "",
    priority: editingTask?.priority?.toUpperCase() ?? "MEDIUM",
    status: editingTask?.status ?? "PENDING",
    dueDate: toDateInputValue(editingTask?.dueDate),
  }));

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function handleChange(event) {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));

    setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const title = formData.title.trim();

    if (!title) {
      setError("Task title is required.");
      return;
    }

    const taskData = {
      title,
      description: formData.description.trim(),
      priority: formData.priority,
      dueDate: formData.dueDate
        ? new Date(`${formData.dueDate}T12:00:00`).toISOString()
        : null,
    };

    if (editingTask) {
      taskData.status = formData.status;
    }

    setSubmitting(true);
    setError("");

    try {
      const result = editingTask
        ? await onUpdateTask({ ...taskData, id: editingTask.id })
        : await onAddTask(taskData);

      if (!result?.success) {
        setError(result?.message || "Unable to save this task.");
      }
    } catch {
      setError("Something went wrong while saving the task.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <h2 className="text-lg font-bold text-slate-900">
        {editingTask ? "Edit Task" : "Create New Task"}
      </h2>

      <div>
        <label
          htmlFor="title"
          className="mb-2 block text-sm font-medium text-slate-700"
        >
          Task Title *
        </label>
        <input
          id="title"
          name="title"
          value={formData.title}
          onChange={handleChange}
          placeholder="e.g. Complete React assignment"
          maxLength={200}
          required
          className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500"
        />
      </div>

      <div>
        <label
          htmlFor="description"
          className="mb-2 block text-sm font-medium text-slate-700"
        >
          Description
        </label>
        <textarea
          id="description"
          name="description"
          value={formData.description}
          onChange={handleChange}
          placeholder="Describe your task..."
          rows={3}
          className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="priority"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Priority
          </label>
          <select
            id="priority"
            name="priority"
            value={formData.priority}
            onChange={handleChange}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500"
          >
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="dueDate"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Due Date
          </label>
          <input
            id="dueDate"
            name="dueDate"
            type="date"
            value={formData.dueDate}
            onChange={handleChange}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {editingTask && (
        <div>
          <label
            htmlFor="status"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Status
          </label>
          <select
            id="status"
            name="status"
            value={formData.status}
            onChange={handleChange}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-indigo-500"
          >
            <option value="PENDING">Pending</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting && <LoaderCircle size={17} className="animate-spin" />}
          {submitting
            ? "Saving..."
            : editingTask
              ? "Save Changes"
              : "Add Task"}
        </button>

        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-xl border border-slate-200 px-5 py-3 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
