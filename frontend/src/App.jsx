import { useState } from "react";
import {
  BrowserRouter,
  Link,
  Routes,
  Route,
  Navigate,
  Outlet,
} from "react-router-dom";

import { AuthProvider } from "./context/AuthContext";
import { useAuth } from "./context/useAuth";
import { ThemeProvider } from "./context/ThemeContext.jsx";

import Sidebar from "./components/layout/Sidebar";
import Header from "./components/layout/Header";

import Dashboard from "./pages/Dashboard";
import Tasks from "./pages/Tasks";
import Notes from "./pages/Notes";
import Social from "./pages/Social";
import Notifications from "./pages/Notifications";
import Profile from "./pages/Profile";
import PublicProfile from "./pages/PublicProfile";
import PrivacySettings from "./pages/PrivacySettings";
import DiscoverUsers from "./pages/DiscoverUsers";
import UserConnections from "./pages/UserConnections";
import ExploreNotes from "./pages/ExploreNotes";
import PublicNoteDetail from "./pages/PublicNoteDetail";
import PopularCreators from "./pages/PopularCreators";
import {
  AdminAccessGate,
  AdminAnnouncements,
  AdminAnalytics,
  AdminHealth,
  AdminLayout,
  AdminOverview,
  AdminReports,
  AdminUsers,
  PublicNotesPage,
  UnavailablePage,
} from "./pages/admin/AdminDashboard";

import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import "./App.css";

function ProtectedRoute() {
  const { isAuthenticated } = useAuth();

  return isAuthenticated
    ? <Outlet />
    : <Navigate to="/login" replace />;
}

function AdminRoute() {
  const { user } = useAuth();
  return user?.role === "ADMIN" ? <Outlet /> : <Navigate to="/dashboard" replace />;
}

function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  return (
    <div className="app-shell">
      {mobileNavigationOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileNavigationOpen(false)}
        />
      )}

      <Sidebar
        collapsed={sidebarCollapsed}
        open={mobileNavigationOpen}
        onClose={() => setMobileNavigationOpen(false)}
        onToggleCollapsed={() => setSidebarCollapsed((current) => !current)}
      />

      <div className="app-main">
        <Header
          onOpenNavigation={() => setMobileNavigationOpen(true)}
          onToggleSidebar={() => setSidebarCollapsed((current) => !current)}
        />

        <main className="app-content" id="main-content">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/notes" element={<Notes />} />
            <Route path="/notes/:noteId" element={<PublicNoteDetail />} />
            <Route path="/social" element={<Social />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/users/:username" element={<PublicProfile />} />
            <Route path="/settings/privacy" element={<PrivacySettings />} />
            <Route path="/discover" element={<DiscoverUsers />} />
            <Route path="/explore" element={<ExploreNotes />} />
            <Route path="/creators/popular" element={<PopularCreators />} />
            <Route path="/users/:username/followers" element={<UserConnections direction="followers" />} />
            <Route path="/users/:username/following" element={<UserConnections direction="following" />} />

            <Route
              path="*"
              element={<section className="route-not-found" role="status"><p>404</p><h1>Page not found</h1><p>This TaskFlow page does not exist or may have moved.</p><Link to="/dashboard">Return to dashboard</Link></section>}
            />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={
          isAuthenticated
            ? <Navigate to="/dashboard" replace />
            : <Login />
        }
      />

      <Route
        path="/register"
        element={
          isAuthenticated
            ? <Navigate to="/dashboard" replace />
            : <Register />
        }
      />

      <Route element={<ProtectedRoute />}>
        <Route element={<AdminRoute />}>
          <Route path="/admin" element={<AdminAccessGate />}>
            <Route element={<AdminLayout />}>
              <Route index element={<Navigate to="overview" replace />} />
              <Route path="overview" element={<AdminOverview />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="notes" element={<PublicNotesPage />} />
              <Route path="reports" element={<AdminReports />} />
              <Route path="moderation" element={<PublicNotesPage moderation />} />
              <Route path="announcements" element={<AdminAnnouncements />} />
              <Route path="analytics" element={<AdminAnalytics />} />
              <Route path="health" element={<AdminHealth />} />
              <Route path="audit-logs" element={<UnavailablePage title="Audit logs" description="Review administrator and security events." endpoint="No audit-log endpoint exists in the current API Gateway or service routes." />} />
              <Route path="settings" element={<UnavailablePage title="Admin settings" description="Configure platform-wide administrator settings." endpoint="No administrator settings API is currently available." />} />
            </Route>
          </Route>
        </Route>
        <Route path="/*" element={<AppLayout />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
