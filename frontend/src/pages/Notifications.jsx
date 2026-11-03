import { useCallback, useEffect, useState } from "react";
import {
  Bell, Check, CheckCheck, CheckCircle2, FileText, Heart,
  Info, LoaderCircle, Megaphone, MessageCircle, RefreshCw, Star, Trash2,
  UserRound,
} from "lucide-react";
import api, { getApiError } from "../services/api";

const PAGE_SIZE = 20;
const categories = ["TASK", "FOLLOW", "NOTE", "LIKE", "COMMENT", "RATING", "ANNOUNCEMENT", "SYSTEM"];
const categoryIcons = {
  TASK: CheckCircle2,
  FOLLOW: UserRound,
  NOTE: FileText,
  LIKE: Heart,
  COMMENT: MessageCircle,
  RATING: Star,
  ANNOUNCEMENT: Megaphone,
  SYSTEM: Info,
};

function categoryLabel(category) {
  return category?.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Notification";
}

function formatTime(value) {
  if (!value) return "Recently";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Recently" : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function broadcastUnreadChange() {
  window.dispatchEvent(new Event("taskflow:notifications-updated"));
}

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, pageSize: PAGE_SIZE, total: 0 });
  const [filter, setFilter] = useState({ readState: "all", category: "" });
  const [loading, setLoading] = useState(true);
  const [unreadLoading, setUnreadLoading] = useState(true);
  const [error, setError] = useState("");
  const [unreadError, setUnreadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [markingAll, setMarkingAll] = useState(false);
  const totalPages = Math.max(1, Math.ceil(pagination.total / PAGE_SIZE));

  const loadUnreadCount = useCallback(async () => {
    setUnreadLoading(true);
    try {
      const response = await api.get("/api/notifications/unread-count");
      setUnreadCount(response.data.count);
      setUnreadError("");
    } catch (requestError) {
      setUnreadError(getApiError(requestError));
      setUnreadCount(null);
    } finally {
      setUnreadLoading(false);
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = { page: pagination.page, pageSize: PAGE_SIZE };
    if (filter.readState !== "all") params.isRead = filter.readState === "read" ? "true" : "false";
    if (filter.category) params.category = filter.category;
    try {
      const response = await api.get("/api/notifications", { params });
      setNotifications(response.data.data);
      setPagination(response.data.pagination);
    } catch (requestError) {
      setNotifications([]);
      setError(getApiError(requestError));
    } finally {
      setLoading(false);
    }
  }, [filter.category, filter.readState, pagination.page]);

  useEffect(() => {
    const timer = window.setTimeout(loadNotifications, 0);
    return () => window.clearTimeout(timer);
  }, [loadNotifications]);

  useEffect(() => {
    const timer = window.setTimeout(loadUnreadCount, 0);
    return () => window.clearTimeout(timer);
  }, [loadUnreadCount]);

  async function refreshAll() {
    setActionError("");
    await Promise.all([loadNotifications(), loadUnreadCount()]);
  }

  async function markAsRead(notificationId) {
    setBusyId(notificationId);
    setActionError("");
    try {
      const response = await api.patch(`/api/notifications/${notificationId}/read`);
      if (filter.readState === "unread") {
        setNotifications((current) => current.filter((item) => item.id !== notificationId));
        setPagination((current) => ({ ...current, total: Math.max(0, current.total - 1) }));
      } else {
        setNotifications((current) => current.map((item) => item.id === notificationId ? response.data.data : item));
      }
      await loadUnreadCount();
      broadcastUnreadChange();
    } catch (requestError) {
      setActionError(getApiError(requestError));
    } finally {
      setBusyId(null);
    }
  }

  async function markAllAsRead() {
    setMarkingAll(true);
    setActionError("");
    try {
      await api.patch("/api/notifications/read-all");
      if (filter.readState === "unread") {
        setNotifications([]);
        setPagination((current) => ({ ...current, total: 0, page: 1 }));
      } else {
        setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
      }
      await loadUnreadCount();
      broadcastUnreadChange();
    } catch (requestError) {
      setActionError(getApiError(requestError));
    } finally {
      setMarkingAll(false);
    }
  }

  async function deleteNotification(notificationId) {
    setBusyId(notificationId);
    setActionError("");
    try {
      await api.delete(`/api/notifications/${notificationId}`);
      setNotifications((current) => current.filter((item) => item.id !== notificationId));
      setPagination((current) => ({ ...current, total: Math.max(0, current.total - 1) }));
      await loadUnreadCount();
      await loadNotifications();
      broadcastUnreadChange();
    } catch (requestError) {
      setActionError(getApiError(requestError));
    } finally {
      setBusyId(null);
    }
  }

  function changeFilter(name, value) {
    setFilter((current) => ({ ...current, [name]: value }));
    setPagination((current) => ({ ...current, page: 1 }));
  }

  return (
    <div className="notifications-page">
      <header className="notifications-heading"><div><p className="notifications-eyebrow">YOUR INBOX</p><h1>Notifications</h1><p>Stay up to date on tasks and activity across TaskFlow.</p></div><button type="button" className="notification-secondary-button" onClick={refreshAll} disabled={loading}><RefreshCw size={16} className={loading ? "animate-spin" : ""} />Refresh</button></header>

      <section className="notifications-summary"><div className="notifications-summary-icon"><Bell size={20} /></div><div className="notifications-summary-copy"><strong>{unreadLoading ? "…" : unreadCount ?? "—"} unread {unreadCount === 1 ? "notification" : "notifications"}</strong><span>Unread total from your Notification Service inbox</span></div>{unreadError && <span className="notifications-summary-error" role="status">Count unavailable</span>}</section>

      {(error || actionError || unreadError) && <div className="notifications-error" role="alert"><span>{actionError || error || unreadError}</span><button type="button" onClick={refreshAll}>Try again</button></div>}

      <section className="notifications-toolbar" aria-label="Notification filters"><div className="notification-filter-tabs" role="group" aria-label="Read status">{[["all", "All"], ["unread", "Unread"], ["read", "Read"]].map(([value, label]) => <button type="button" key={value} className={filter.readState === value ? "is-active" : ""} onClick={() => changeFilter("readState", value)}>{label}</button>)}</div><label className="notification-category-filter">Category<select value={filter.category} onChange={(event) => changeFilter("category", event.target.value)}><option value="">All categories</option>{categories.map((category) => <option key={category} value={category}>{categoryLabel(category)}</option>)}</select></label><span className="notifications-toolbar-spacer" /><button type="button" className="notification-secondary-button" onClick={markAllAsRead} disabled={markingAll || unreadCount === 0 || unreadCount === null}>{markingAll ? <LoaderCircle size={15} className="animate-spin" /> : <CheckCheck size={15} />}Mark all as read</button></section>

      <section className="notifications-list" aria-label="Notifications">
        {loading ? <div className="notification-skeleton-list" aria-label="Loading notifications">{Array.from({ length: 5 }, (_, index) => <div className="notification-skeleton-row" key={index}><span /><div><span /><span /></div></div>)}</div>
          : error ? <div className="notifications-empty"><Bell size={29} /><h2>Notifications couldn’t be loaded</h2><p>Check your connection and try again.</p><button type="button" className="notification-secondary-button" onClick={loadNotifications}>Try again</button></div>
            : notifications.length === 0 ? <div className="notifications-empty"><Bell size={29} /><h2>{filter.readState === "unread" ? "You’re all caught up" : filter.category ? "No notifications in this category" : "No notifications yet"}</h2><p>{filter.readState === "unread" ? "New activity will appear here." : "Notifications from tasks and community activity will appear here."}</p></div>
              : <>{notifications.map((notification) => {
                const Icon = categoryIcons[notification.category] || Info;
                return <article className={`notification-row ${notification.isRead ? "is-read" : "is-unread"}`} key={notification.id}><div className={`notification-type-icon notification-type-${notification.category?.toLowerCase() || "system"}`}><Icon size={18} aria-hidden="true" /></div><div className="notification-body"><div className="notification-title-line"><h2>{notification.title}</h2>{!notification.isRead && <span className="notification-unread-dot" aria-label="Unread" />}<time dateTime={notification.createdAt}>{formatTime(notification.createdAt)}</time></div><p>{notification.message}</p><div className="notification-row-footer"><span className="notification-category-chip">{categoryLabel(notification.category)}</span>{notification.isRead ? <span className="notification-read-label"><CheckCircle2 size={13} />Read</span> : <button type="button" className="notification-text-action" onClick={() => markAsRead(notification.id)} disabled={busyId === notification.id}>{busyId === notification.id ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}Mark as read</button>}<button type="button" className="notification-delete-button" onClick={() => deleteNotification(notification.id)} disabled={busyId === notification.id} aria-label={`Delete notification: ${notification.title}`}><Trash2 size={14} />Delete</button></div></div></article>;
              })}<footer className="notifications-pagination"><span>Page {pagination.page} of {totalPages} · {pagination.total} notifications</span><div><button type="button" onClick={() => setPagination((current) => ({ ...current, page: current.page - 1 }))} disabled={pagination.page <= 1}>Previous</button><button type="button" onClick={() => setPagination((current) => ({ ...current, page: current.page + 1 }))} disabled={pagination.page >= totalPages}>Next</button></div></footer></>}
      </section>
    </div>
  );
}
