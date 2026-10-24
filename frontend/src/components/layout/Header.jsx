import { Bell, Search, LogOut, UserRound } from "lucide-react";

import { useAuth } from "../../context/AuthContext";

export default function Header() {
  const { user, logout } = useAuth();

  return (
    <header className="flex flex-col gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          TaskFlow
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          Welcome back, {user?.name || "User"}!
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 sm:flex">
          <Search size={18} className="text-slate-400" />

          <input
            type="text"
            placeholder="Search..."
            className="w-36 bg-transparent text-sm outline-none"
          />
        </div>

        <button
          type="button"
          aria-label="Notifications"
          className="rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50"
        >
          <Bell size={20} />
        </button>

        <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
          <UserRound size={20} className="text-indigo-600" />

          <div className="hidden sm:block">
            <p className="max-w-36 truncate text-sm font-semibold text-slate-800">
              {user?.name || "User"}
            </p>

            <p className="max-w-36 truncate text-xs text-slate-500">
              {user?.email || ""}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={logout}
          className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-100"
        >
          <LogOut size={18} />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}