import { NavLink } from "react-router-dom";

import {
  LayoutDashboard,
  CheckSquare,
  FileText,
  UsersRound,
  Bell,
  UserRound,
  ListTodo,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  LogOut,
  Shield,
  Settings2,
  Compass,
  Trophy,
} from "lucide-react";
import { useAuth } from "../../context/useAuth";

const navigation = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
  { label: "My Tasks", icon: CheckSquare, path: "/tasks" },
  { label: "My Notes", icon: FileText, path: "/notes" },
  { label: "Community Feed", icon: UsersRound, path: "/social" },
  { label: "Discover people", icon: UsersRound, path: "/discover" },
  { label: "Explore notes", icon: Compass, path: "/explore" },
  { label: "Popular creators", icon: Trophy, path: "/creators/popular" },
  { label: "Notifications", icon: Bell, path: "/notifications" },
  { label: "Profile", icon: UserRound, path: "/profile" },
  { label: "Privacy", icon: Settings2, path: "/settings/privacy" },
];

function AdminNavigationLink() {
  const { user } = useAuth();

  if (user?.role !== "ADMIN") return null;
  return (
    <NavLink to="/admin/overview" className={({ isActive }) => `sidebar-link ${isActive ? "is-active" : ""}`} aria-label="Admin Dashboard">
      <Shield size={19} />
      <span className="sidebar-link-label">Admin Dashboard</span>
    </NavLink>
  );
}

export default function Sidebar({
  collapsed,
  open,
  onClose,
  onToggleCollapsed,
}) {
  const { logout } = useAuth();

  return (
    <aside
      className={`taskflow-sidebar ${collapsed ? "is-collapsed" : ""} ${open ? "is-open" : ""}`}
      aria-label="Main navigation"
    >
      <div className="sidebar-brand">
        <div className="sidebar-logo" aria-hidden="true">
          <ListTodo size={22} />
        </div>
        <div className="sidebar-brand-copy">
          <p className="sidebar-brand-title">TaskFlow</p>
          <p className="sidebar-brand-caption">WORKSPACE</p>
        </div>
        <button
          type="button"
          className="sidebar-collapse-button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
        <button
          type="button"
          className="sidebar-close-button"
          onClick={onClose}
          aria-label="Close navigation"
        >
          <X size={20} />
        </button>
      </div>

      <p className="sidebar-section-label">Workspace</p>

      <nav className="sidebar-navigation">
        {navigation.map(({ label, icon: Icon, path }) => (
          <NavLink
            key={path}
            to={path}
            onClick={onClose}
            title={collapsed ? label : undefined}
            aria-label={label}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? "is-active" : ""}`
            }
          >
            <Icon size={19} />
            <span className="sidebar-link-label">{label}</span>
          </NavLink>
        ))}
        <AdminNavigationLink />
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-status-mark" aria-hidden="true" />
        <span className="sidebar-footer-label">Your workspace</span>
        <button
          type="button"
          className="sidebar-logout"
          onClick={logout}
          title={collapsed ? "Log out" : undefined}
        >
          <LogOut size={18} />
          <span className="sidebar-link-label">Log out</span>
        </button>
      </div>
    </aside>
  );
}
