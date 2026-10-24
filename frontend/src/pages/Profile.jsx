import { useEffect, useState } from "react";
import {
  UserRound,
  Mail,
  CalendarDays,
  Clock3,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Pencil,
  X,
  Save,
  CheckCircle2,
} from "lucide-react";

import api, { getApiError } from "../services/api";
import { useAuth } from "../context/AuthContext";

function formatDate(value) {
  if (!value) return "Not available";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Not available";

  return new Intl.DateTimeFormat("en-PK", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function getInitials(name) {
  return (
    name
      ?.trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U"
  );
}

function ProfileItem({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-4 rounded-xl border border-slate-100 p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
        <Icon size={20} />
      </div>

      <div className="min-w-0">
        <p className="text-sm text-slate-500">{label}</p>
        <p className="mt-1 break-words font-medium text-slate-800">
          {value || "Not available"}
        </p>
      </div>
    </div>
  );
}

export default function Profile() {
  const { user: savedUser, updateUser } = useAuth();

  const [profile, setProfile] = useState(savedUser);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({ name: "", email: "" });

  async function fetchProfile() {
    setLoading(true);
    setError("");

    try {
      const response = await api.get("/api/users/profile");
      const user = response.data?.user;

      if (!user) {
        throw new Error("The server returned an invalid profile response.");
      }

      setProfile(user);
      setForm({ name: user.name || "", email: user.email || "" });
    } catch (err) {
      setError(
        err.response ? getApiError(err) : err.message || getApiError(err)
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProfile();
  }, []);

  function startEditing() {
    setForm({
      name: profile?.name || "",
      email: profile?.email || "",
    });
    setError("");
    setSuccess("");
    setEditing(true);
  }

  function cancelEditing() {
    setForm({
      name: profile?.name || "",
      email: profile?.email || "",
    });
    setEditing(false);
    setError("");
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();

    if (!name) {
      setError("Please enter your full name.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    setSaving(true);

    try {
      const response = await api.put("/api/users/profile", {
        name,
        email,
      });

      const updatedUser = response.data?.user;

      if (!updatedUser) {
        throw new Error("The server returned an invalid profile response.");
      }

      setProfile(updatedUser);
      setForm({ name: updatedUser.name, email: updatedUser.email });

      if (typeof updateUser === "function") {
        updateUser(updatedUser);
      }

      setEditing(false);
      setSuccess("Your profile has been updated successfully.");
    } catch (err) {
      setError(
        err.response ? getApiError(err) : err.message || getApiError(err)
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">My Profile</h2>
          <p className="mt-1 text-sm text-slate-500">
            Manage your personal information and account details.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchProfile}
          disabled={loading || saving}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {success && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700"
        >
          <CheckCircle2 size={18} />
          {success}
        </div>
      )}

      {loading && !profile ? (
        <div className="flex min-h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center gap-3 text-slate-500">
            <LoaderCircle className="animate-spin" size={22} />
            Loading your profile...
          </div>
        </div>
      ) : (
        <>
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="h-28 bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-500" />

            <div className="px-6 pb-6 sm:px-8">
              <div className="-mt-12 flex flex-col items-center gap-4 sm:flex-row sm:items-end">
                <div className="flex h-24 w-24 items-center justify-center rounded-2xl border-4 border-white bg-indigo-100 text-3xl font-bold text-indigo-700 shadow-sm">
                  {getInitials(profile?.name)}
                </div>

                <div className="pb-1 text-center sm:text-left">
                  <h3 className="text-xl font-bold text-slate-900">
                    {profile?.name || "Your Account"}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {profile?.email || "Email not available"}
                  </p>
                </div>

                <div className="flex flex-wrap justify-center gap-2 pb-1 sm:ml-auto">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                    <ShieldCheck size={15} />
                    Authenticated
                  </span>

                  {!editing && (
                    <button
                      type="button"
                      onClick={startEditing}
                      className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                    >
                      <Pencil size={15} />
                      Edit Profile
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>

          {editing ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <div className="mb-6">
                <h3 className="text-lg font-bold text-slate-900">
                  Edit Personal Information
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Update your name and email address.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label
                    htmlFor="name"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Full Name
                  </label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    maxLength={100}
                    required
                    value={form.name}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>

                <div>
                  <label
                    htmlFor="email"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Email Address
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    maxLength={254}
                    required
                    value={form.email}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={cancelEditing}
                    disabled={saving}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    <X size={16} />
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? (
                      <LoaderCircle className="animate-spin" size={16} />
                    ) : (
                      <Save size={16} />
                    )}
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            </section>
          ) : (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <div className="mb-6">
                <h3 className="text-lg font-bold text-slate-900">
                  Personal Information
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Information retrieved from your TaskFlow account.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <ProfileItem
                  icon={UserRound}
                  label="Full Name"
                  value={profile?.name}
                />
                <ProfileItem
                  icon={Mail}
                  label="Email Address"
                  value={profile?.email}
                />
                <ProfileItem
                  icon={CalendarDays}
                  label="Account Created"
                  value={formatDate(profile?.createdAt)}
                />
                <ProfileItem
                  icon={Clock3}
                  label="Last Updated"
                  value={formatDate(profile?.updatedAt)}
                />
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}