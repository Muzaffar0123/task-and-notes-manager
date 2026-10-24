import { NavLink } from "react-router-dom";

import {
  LayoutDashboard,
  CheckSquare,
  Bell,
  UserRound,
  Settings,
  ListTodo,
} from "lucide-react";

const navigation = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
  { label: "My Tasks", icon: CheckSquare, path: "/tasks" },
  { label: "Notifications", icon: Bell, path: "/notifications" },
  { label: "Profile", icon: UserRound, path: "/profile" },
];

export default function Sidebar() {
  return (
    <aside className="flex min-h-screen w-64 flex-col border-r border-slate-200 bg-white p-5">
      <div className="mb-10 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white">
          <ListTodo size={23} />
        </div>

        <div>
          <h1 className="text-xl font-bold text-slate-900">TaskFlow</h1>
          <p className="text-xs text-slate-500">Manage your work</p>
        </div>
      </div>

      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Workspace
      </p>

      <nav className="space-y-2">
        {navigation.map(({ label, icon: Icon, path }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
                isActive
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-50"
              }`
            }
          >
            <Icon size={19} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto rounded-2xl bg-slate-50 p-4">
        <p className="font-semibold text-slate-800">Stay productive!</p>
        <p className="mt-1 text-sm text-slate-500">
          Organize your work, one task at a time.
        </p>
      </div>
    </aside>
  );
}