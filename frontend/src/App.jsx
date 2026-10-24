import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
} from "react-router-dom";

import { AuthProvider, useAuth } from "./context/AuthContext";

import Sidebar from "./components/layout/Sidebar";
import Header from "./components/layout/Header";

import Dashboard from "./pages/Dashboard";
import Tasks from "./pages/Tasks";
import Notifications from "./pages/Notifications";
import Profile from "./pages/Profile";

import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";

function ProtectedRoute() {
  const { isAuthenticated } = useAuth();

  return isAuthenticated
    ? <Outlet />
    : <Navigate to="/login" replace />;
}

function AppLayout() {
  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      <div className="hidden md:block">
        <Sidebar />
      </div>

      <main className="min-w-0 flex-1">
        <Header />

        <div className="p-5 sm:p-8">
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/profile" element={<Profile />} />

            <Route
              path="*"
              element={
                <h2 className="text-xl font-bold">
                  404 — Page not found
                </h2>
              }
            />
          </Routes>
        </div>
      </main>
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
        <Route path="/*" element={<AppLayout />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}