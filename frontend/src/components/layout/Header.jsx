import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
    LogOut,
  ChevronDown,
  Menu,
  Moon,
  Monitor,
  Plus,
  Search,
  Sun,
  UserRound,
} from "lucide-react";

import { useAuth } from "../../context/useAuth";
import { useTheme } from "../../context/useTheme";
import api from "../../services/api";

const searchablePages = [
  { label: "Dashboard", path: "/dashboard" },
  { label: "My Tasks", path: "/tasks" },
  { label: "My Notes", path: "/notes" },
  { label: "Community Feed", path: "/social" },
  { label: "Discover people", path: "/discover" },
  { label: "Explore notes", path: "/explore" },
  { label: "Popular creators", path: "/creators/popular" },
  { label: "Notifications", path: "/notifications" },
  { label: "Profile", path: "/profile" },
  { label: "Privacy", path: "/settings/privacy" },
];

const pageTitles = {
  ...Object.fromEntries(searchablePages.map((page) => [page.path, page.label])),
  "/admin/overview": "Admin Dashboard",
};

function getInitials(name) {
  return name?.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
}

export default function Header({ onOpenNavigation, onToggleSidebar }) {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [searchText, setSearchText] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const matchingPages = useMemo(() => {
    const pages = user?.role === "ADMIN"
      ? [...searchablePages, { label: "Admin Dashboard", path: "/admin/overview" }]
      : searchablePages;
    const query = searchText.trim().toLowerCase();
    if (!query) return pages;
    return pages.filter((page) => page.label.toLowerCase().includes(query));
  }, [searchText, user?.role]);

  useEffect(() => {
    let active = true;
    function refreshUnreadCount() {
      api.get("/api/notifications/unread-count")
        .then((response) => {
          if (active) setUnreadCount(Number(response.data?.count) || 0);
        })
        .catch(() => {
          if (active) setUnreadCount(0);
        });
    }
    refreshUnreadCount();
    window.addEventListener("taskflow:notifications-updated", refreshUnreadCount);
    return () => {
      active = false;
      window.removeEventListener("taskflow:notifications-updated", refreshUnreadCount);
    };
  }, [location.pathname]);

  function submitSearch(event) {
    event.preventDefault();
    if (matchingPages[0]) {
      navigate(matchingPages[0].path);
      setSearchText("");
      setSearchOpen(false);
    }
  }

  function selectPage(path) {
    navigate(path);
    setSearchText("");
    setSearchOpen(false);
  }

  return (
    <header className="taskflow-header">
      <div className="header-leading">
        <button
          type="button"
          className="header-icon-button mobile-menu-button"
          onClick={onOpenNavigation}
          aria-label="Open navigation"
        >
          <Menu size={20} />
        </button>
        <button
          type="button"
          className="header-icon-button desktop-sidebar-button"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar width"
        >
          <Menu size={19} />
        </button>
        <div className="header-page-title">
          <span className="header-eyebrow">TASKFLOW / WORKSPACE</span>
          <h1>{pageTitles[location.pathname] || "Workspace"}</h1>
        </div>
      </div>

      <div className="header-actions">
        <form className="header-search" role="search" onSubmit={submitSearch}>
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            value={searchText}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => window.setTimeout(() => setSearchOpen(false), 120)}
            onChange={(event) => setSearchText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setSearchOpen(false);
            }}
            placeholder="Jump to a page"
            aria-label="Search TaskFlow pages"
            aria-expanded={searchOpen}
            aria-controls="page-search-results"
          />
          {searchOpen && matchingPages.length > 0 && (
            <div className="page-search-results" id="page-search-results" role="listbox">
              {matchingPages.map((page) => (
                <button
                  type="button"
                  key={page.path}
                  role="option"
                  aria-selected={page.path === location.pathname}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectPage(page.path)}
                >
                  {page.label}
                </button>
              ))}
            </div>
          )}
        </form>

        <button
          type="button"
          className="header-create-button"
          onClick={() => navigate("/tasks?create=task")}
        >
          <Plus size={18} />
          <span>Create task</span>
        </button>

        <Link to="/notifications" className="header-icon-button notification-button" aria-label="Notifications">
          <Bell size={19} />
          {unreadCount > 0 && <span className="notification-count">{unreadCount > 99 ? "99+" : unreadCount}</span>}
        </Link>

        <label className="theme-picker">
          <span className="sr-only">Color theme</span>
          {theme === "dark" ? <Moon size={16} /> : theme === "system" ? <Monitor size={16} /> : <Sun size={16} />}
          <select value={theme} onChange={(event) => setTheme(event.target.value)} aria-label="Color theme">
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
          <ChevronDown size={14} aria-hidden="true" />
        </label>

        <div className="profile-menu-wrap">
          <button
            type="button"
            className="profile-menu-trigger"
            aria-haspopup="menu"
            aria-expanded={profileOpen}
            onClick={() => setProfileOpen((current) => !current)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setProfileOpen(false);
            }}
          >
            <span className="profile-avatar">{getInitials(user?.name)}</span>
            <span className="profile-menu-copy">
              <span className="profile-menu-name">{user?.name || "User"}</span>
              <span className="profile-menu-email">{user?.email || ""}</span>
            </span>
            <ChevronDown size={15} aria-hidden="true" />
          </button>
          {profileOpen && (
            <div className="profile-menu" role="menu">
              <Link to="/profile" role="menuitem" onClick={() => setProfileOpen(false)}>
                <UserRound size={16} /> Profile
              </Link>
              <button type="button" role="menuitem" onClick={logout}>
                <LogOut size={16} /> Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
