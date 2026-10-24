import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  CheckCircle2,
  Clock3,
  Info,
  LoaderCircle,
  RefreshCw,
  Check,
} from "lucide-react";
import api, { getApiError } from "../services/api";

function formatTime(date) {
  if (!date) return "Recently";

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return "Recently";
  }

  return parsedDate.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getNotificationIcon(title = "") {
  const normalizedTitle = title.toLowerCase();

  if (normalizedTitle.includes("task")) {
    return {
      Icon: CheckCircle2,
      color: "bg-emerald-50 text-emerald-600",
    };
  }

  if (
    normalizedTitle.includes("deadline") ||
    normalizedTitle.includes("due")
  ) {
    return {
      Icon: Clock3,
      color: "bg-amber-50 text-amber-600",
    };
  }

  return {
    Icon: Info,
    color: "bg-indigo-50 text-indigo-600",
  };
}

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [markingId, setMarkingId] = useState(null);

  const unreadCount = notifications.filter(
    (notification) => !notification.isRead
  ).length;

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await api.get("/api/notifications");

      // Supports the usual { success: true, data: [...] } response.
      const result = response.data;
      const list = Array.isArray(result)
        ? result
        : Array.isArray(result.data)
          ? result.data
          : Array.isArray(result.notifications)
            ? result.notifications
            : [];

      setNotifications(list);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  async function handleMarkAsRead(notificationId) {
    setMarkingId(notificationId);
    setError("");

    try {
      await api.patch(
        `/api/notifications/${notificationId}/read`
      );

      setNotifications((current) =>
        current.map((notification) =>
          notification.id === notificationId
            ? { ...notification, isRead: true }
            : notification
        )
      );
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setMarkingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            Notifications
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Stay updated on your tasks and activities.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchNotifications}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw
            size={16}
            className={loading ? "animate-spin" : ""}
          />
          Refresh
        </button>
      </div>

      <div className="flex items-center gap-3 rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-indigo-600">
          <Bell size={21} />
        </div>

        <div>
          <p className="font-semibold text-slate-900">
            {unreadCount} unread{" "}
            {unreadCount === 1 ? "notification" : "notifications"}
          </p>

          <p className="text-sm text-slate-600">
            You can mark notifications as read below.
          </p>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <p className="font-semibold">Unable to complete the request</p>
          <p className="mt-1">{error}</p>

          <button
            type="button"
            onClick={fetchNotifications}
            className="mt-3 font-semibold underline"
          >
            Try again
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 p-12 text-slate-500">
            <LoaderCircle
              size={28}
              className="animate-spin text-indigo-600"
            />
            <p className="text-sm">Loading notifications...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
              <Bell size={25} />
            </div>

            <h3 className="mt-4 font-semibold text-slate-800">
              No notifications yet
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              Create a task to see a notification here.
            </p>
          </div>
        ) : (
          notifications.map((notification) => {
            const { Icon, color } = getNotificationIcon(
              notification.title
            );

            return (
              <div
                key={notification.id}
                className={`flex gap-4 border-b border-slate-100 p-5 transition last:border-0 hover:bg-slate-50 ${
                  notification.isRead ? "bg-white" : "bg-indigo-50/40"
                }`}
              >
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${color}`}
                >
                  <Icon size={21} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-800">
                        {notification.title}
                      </h3>

                      {!notification.isRead && (
                        <span className="h-2 w-2 rounded-full bg-indigo-600" />
                      )}
                    </div>

                    <span className="text-xs text-slate-400">
                      {formatTime(notification.createdAt)}
                    </span>
                  </div>

                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-500">
                    {notification.message}
                  </p>

                  {!notification.isRead && (
                    <button
                      type="button"
                      onClick={() =>
                        handleMarkAsRead(notification.id)
                      }
                      disabled={markingId === notification.id}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-indigo-600 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {markingId === notification.id ? (
                        <LoaderCircle
                          size={15}
                          className="animate-spin"
                        />
                      ) : (
                        <Check size={15} />
                      )}

                      Mark as read
                    </button>
                  )}

                  {notification.isRead && (
                    <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-emerald-600">
                      <CheckCircle2 size={14} />
                      Read
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}