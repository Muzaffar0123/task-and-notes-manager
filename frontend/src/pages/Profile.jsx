import { useCallback, useEffect, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  Mail,
  Pencil,
  RefreshCw,
  Save,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";

import api, { getApiError } from "../services/api";
import { useAuth } from "../context/useAuth";

function formatDate(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not available"
    : new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long", year: "numeric" }).format(date);
}

function getInitials(name) {
  return name?.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
}

function ProfileItem({ icon: Icon, label, value }) {
  return (
    <div className="account-profile-detail">
      <span className="account-profile-detail-icon"><Icon size={17} aria-hidden="true" /></span>
      <div className="account-profile-detail-copy">
        <span>{label}</span>
        <strong>{value || "Not available"}</strong>
      </div>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="account-profile-skeleton" role="status" aria-label="Loading your profile">
      <span className="account-profile-skeleton-hero" />
      <div><span /><span /><span /></div>
      <p>Loading your profile…</p>
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
  const [form, setForm] = useState({ name: "", email: "", username: "", bio: "" });
  const [avatarState, setAvatarState] = useState(null);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const response = await api.get("/api/users/profile");
      const user = response.data?.user;
      if (!user) throw new Error("The server returned an invalid profile response.");
      setProfile(user);
      setForm({ name: user.name || "", email: user.email || "", username: user.username || "", bio: user.bio || "" });
    } catch (fetchError) {
      setError(fetchError.response ? getApiError(fetchError) : fetchError.message || getApiError(fetchError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { fetchProfile(); }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchProfile]);

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    if (!profile?.hasProfileImage) return undefined;
    api.get("/api/users/profile/image", { responseType: "blob" })
      .then((response) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(response.data);
        setAvatarState({ userId: profile.id, url: objectUrl, error: "" });
      })
      .catch((imageError) => {
        if (active) setAvatarState({ userId: profile.id, url: "", error: getApiError(imageError) });
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [profile?.id, profile?.hasProfileImage]);

  const currentAvatar = avatarState?.userId === profile?.id ? avatarState : null;
  const avatarUrl = profile?.hasProfileImage ? currentAvatar?.url : "";
  const avatarLoading = Boolean(profile?.hasProfileImage && !currentAvatar);
  const avatarError = profile?.hasProfileImage ? currentAvatar?.error : "";

  function startEditing() {
    setForm({ name: profile?.name || "", email: profile?.email || "", username: profile?.username || "", bio: profile?.bio || "" });
    setError("");
    setSuccess("");
    setEditing(true);
  }

  function cancelEditing() {
    setForm({ name: profile?.name || "", email: profile?.email || "", username: profile?.username || "", bio: profile?.bio || "" });
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
    const username = form.username.trim().toLowerCase();
    const bio = form.bio.trim();
    if (!name) return setError("Please enter your full name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError("Please enter a valid email address.");
    if (!/^[a-z0-9_]{3,30}$/.test(username)) return setError("Username must be 3 to 30 letters, numbers, or underscores.");
    if (bio.length > 500) return setError("Your bio must be 500 characters or fewer.");

    setSaving(true);
    try {
      const response = await api.put("/api/users/profile", { name, email, username, bio });
      if (!response.data?.user) throw new Error("The server returned an invalid profile response.");
      const updatedUser = { ...profile, ...response.data.user };
      setProfile(updatedUser);
      setForm({ name: updatedUser.name || "", email: updatedUser.email || "", username: updatedUser.username || "", bio: updatedUser.bio || "" });
      if (typeof updateUser === "function") updateUser(updatedUser);
      setEditing(false);
      setSuccess("Your profile has been updated successfully.");
    } catch (saveError) {
      setError(saveError.response ? getApiError(saveError) : saveError.message || getApiError(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="account-profile-page">
      <header className="account-profile-heading">
        <div>
          <p className="account-profile-eyebrow">ACCOUNT SETTINGS</p>
          <h1>My profile</h1>
          <p>Manage your personal details and review your TaskFlow account.</p>
        </div>
        <button type="button" className="account-profile-secondary-button" onClick={fetchProfile} disabled={loading || saving}>
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </header>

      {error && <div className="account-profile-alert" role="alert"><span>{error}</span>{!profile && <button type="button" onClick={fetchProfile} disabled={loading}>Try again</button>}</div>}
      {success && <div className="account-profile-notice" role="status"><CheckCircle2 size={17} />{success}</div>}

      {loading && !profile ? <ProfileSkeleton /> : !profile ? (
        <section className="account-profile-empty">
          <span><UserRound size={22} /></span>
          <h2>Profile unavailable</h2>
          <p>We couldn’t load your account details. Try again in a moment.</p>
          <button type="button" className="account-profile-primary-button" onClick={fetchProfile} disabled={loading}>Retry</button>
        </section>
      ) : (
        <>
          <section className="account-profile-hero" aria-label="Profile overview">
            <div className="account-profile-cover" aria-hidden="true"><span /><span /></div>
            <div className="account-profile-hero-body">
              <div className="account-profile-avatar-wrap">
                <div className="account-profile-avatar" aria-label={`${profile.name || "User"} profile image`}>
                  {avatarUrl ? <img src={avatarUrl} alt="" /> : getInitials(profile.name)}
                  {avatarLoading && <span className="account-profile-avatar-loading"><LoaderCircle size={18} className="animate-spin" /></span>}
                </div>
              </div>
              <div className="account-profile-identity">
                <h2>{profile.name || "Your account"}</h2>
                <p>{profile.email || "Email not available"}</p>
                <span className="account-profile-role"><ShieldCheck size={14} />{profile.role === "ADMIN" ? "Administrator" : "TaskFlow member"}</span>
                {avatarError && <span className="account-profile-avatar-error" role="status">Profile image unavailable</span>}
              </div>
              <button type="button" className="account-profile-primary-button account-profile-edit-button" onClick={editing ? cancelEditing : startEditing} disabled={saving}>
                {editing ? <X size={15} /> : <Pencil size={15} />}{editing ? "Cancel editing" : "Edit profile"}
              </button>
            </div>
          </section>

          <div className="account-profile-grid">
            <section className="account-profile-card account-profile-personal-card">
              <div className="account-profile-card-heading">
                <div><p className="account-profile-eyebrow">PERSONAL DETAILS</p><h2>{editing ? "Edit your information" : "Personal information"}</h2></div>
                {!editing && <span className="account-profile-card-caption">Private to your account</span>}
              </div>

              {editing ? (
                <form className="account-profile-form" onSubmit={handleSubmit}>
                  <label className="account-profile-field">Full name
                    <span><UserRound size={16} /><input name="name" type="text" autoComplete="name" maxLength={100} required value={form.name} onChange={handleChange} /></span>
                  </label>
                  <label className="account-profile-field">Username
                    <span><UserRound size={16} /><input name="username" type="text" autoComplete="username" minLength={3} maxLength={30} pattern="[A-Za-z0-9_]{3,30}" required value={form.username} onChange={handleChange} /></span>
                  </label>
                  <label className="account-profile-field">Bio
                    <textarea name="bio" maxLength={500} rows={3} value={form.bio} onChange={handleChange} />
                  </label>
                  <label className="account-profile-field">Email address
                    <span><Mail size={16} /><input name="email" type="email" autoComplete="email" maxLength={254} required value={form.email} onChange={handleChange} /></span>
                  </label>
                  <div className="account-profile-form-actions">
                    <button type="button" className="account-profile-secondary-button" onClick={cancelEditing} disabled={saving}><X size={15} /> Cancel</button>
                    <button type="submit" className="account-profile-primary-button" disabled={saving}>{saving ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}{saving ? "Saving…" : "Save changes"}</button>
                  </div>
                </form>
              ) : (
                <div className="account-profile-detail-list">
                  <ProfileItem icon={UserRound} label="Full name" value={profile.name} />
                  <ProfileItem icon={UserRound} label="Username" value={`@${profile.username}`} />
                  <ProfileItem icon={UserRound} label="Bio" value={profile.bio} />
                  <ProfileItem icon={Mail} label="Email address" value={profile.email} />
                </div>
              )}
            </section>

            <aside className="account-profile-card account-profile-account-card">
              <div className="account-profile-card-heading"><div><p className="account-profile-eyebrow">ACCOUNT</p><h2>Account details</h2></div></div>
              <div className="account-profile-account-status"><span><ShieldCheck size={17} /></span><div><strong>Account active</strong><small>Signed in securely to TaskFlow</small></div></div>
              <div className="account-profile-account-meta">
                <ProfileItem icon={ShieldCheck} label="Account type" value={profile.role === "ADMIN" ? "Administrator" : "Member"} />
                <ProfileItem icon={CalendarDays} label="Member since" value={formatDate(profile.createdAt)} />
                <ProfileItem icon={Clock3} label="Last updated" value={formatDate(profile.updatedAt)} />
              </div>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
