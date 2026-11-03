import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CalendarDays, CircleUserRound, Heart, LoaderCircle, Star, Trophy, UsersRound } from "lucide-react";
import api, { getApiError } from "../services/api";
import { useAuth } from "../context/useAuth";
import "./ProfilePages.css";

function dateLabel(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(date)
    : "Not available";
}

export default function PublicProfile() {
  const { username } = useParams();
  const { user: currentUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [publicNotes, setPublicNotes] = useState([]);
  const [notesPage, setNotesPage] = useState(1);
  const [notesTotal, setNotesTotal] = useState(0);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState("");
  const [notesReload, setNotesReload] = useState(0);
  const [avatar, setAvatar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [followState, setFollowState] = useState(null);
  const [followLoading, setFollowLoading] = useState(false);
  const [error, setError] = useState("");

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get(`/api/social/profiles/${encodeURIComponent(username)}`);
      setProfile(response.data?.data || null);
      if (!response.data?.data) setError("This profile is unavailable.");
    } catch (requestError) {
      setProfile(null);
      setError(getApiError(requestError));
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    const timer = window.setTimeout(loadProfile, 0);
    return () => window.clearTimeout(timer);
  }, [loadProfile]);

  useEffect(() => {
    if (!profile?.id) return undefined;
    let active = true;
    const timer = window.setTimeout(async () => {
      setNotesLoading(true);
      setNotesError("");
      try {
        const response = await api.get("/api/notes/search", {
          params: { ownerId: profile.id, page: notesPage, pageSize: 12, sortBy: "createdAt", sortOrder: "desc" },
        });
        if (!active) return;
        const notes = response.data?.data;
        if (!Array.isArray(notes)) throw new Error("The server returned an invalid notes response.");
        setPublicNotes(notes.filter((note) => note.visibility === "PUBLIC" && note.status === "PUBLISHED"));
        setNotesTotal(response.data.pagination?.total || 0);
      } catch (requestError) {
        if (active) {
          setPublicNotes([]);
          setNotesError(requestError.response ? getApiError(requestError) : requestError.message || getApiError(requestError));
        }
      } finally {
        if (active) setNotesLoading(false);
      }
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [notesPage, notesReload, profile?.id]);

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    if (!profile?.hasProfileImage) return undefined;
    api.get(`/api/users/${encodeURIComponent(profile.id)}/public-profile/image`, { responseType: "blob" })
      .then((response) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(response.data);
        setAvatar({ userId: profile.id, url: objectUrl });
      })
      .catch((requestError) => {
        if (active) setAvatar({ userId: profile.id, url: "", error: getApiError(requestError) });
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [profile?.id, profile?.hasProfileImage]);

  useEffect(() => {
    let active = true;
    if (!profile || profile.id === currentUser?.id) return undefined;
    api.get(`/api/social/users/${encodeURIComponent(profile.id)}/follow-status`)
      .then((response) => {
        if (active) setFollowState({ userId: profile.id, following: Boolean(response.data.following) });
      })
      .catch((requestError) => {
        if (active) setError(getApiError(requestError));
      });
    return () => { active = false; };
  }, [currentUser?.id, profile]);

  const following = Boolean(
    profile?.id && followState?.userId === profile.id && followState.following,
  );

  async function toggleFollow() {
    setFollowLoading(true);
    setError("");
    try {
      if (following) await api.delete(`/api/social/follows/${encodeURIComponent(profile.id)}`);
      else await api.post("/api/social/follows", { followeeId: profile.id });
      setFollowState({ userId: profile.id, following: !following });
      setProfile((current) => ({
        ...current,
        followerCount: Math.max(0, current.followerCount + (following ? -1 : 1)),
      }));
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setFollowLoading(false);
    }
  }

  if (loading) {
    return <section className="creator-profile-state" role="status"><span className="creator-profile-spinner" />Loading profile…</section>;
  }

  if (!profile) {
    return (
      <section className="creator-profile-state" role="alert">
        <h1>Profile unavailable</h1>
        <p>{error || "This profile could not be found."}</p>
        <button type="button" onClick={loadProfile}>Try again</button>
      </section>
    );
  }

  const currentAvatar = avatar?.userId === profile.id ? avatar : null;
  const avatarUrl = currentAvatar?.url || "";
  const stats = [
    { key: "followers", label: "Followers", value: profile.followerCount, icon: UsersRound },
    { key: "following", label: "Following", value: profile.followingCount, icon: UsersRound },
    { label: "Public notes", value: profile.publicNotesCount, icon: CircleUserRound },
    { label: "Likes received", value: profile.totalLikesReceived, icon: Heart },
    { label: "Ratings received", value: profile.totalRatings, icon: Star },
    { label: "Average rating", value: Number(profile.averageRating || 0).toFixed(2), icon: Star },
    { label: "Popularity score", value: profile.popularityScore, icon: Trophy },
  ];

  return (
    <div className="creator-profile-page">
      <header className="creator-profile-header">
        <div className="creator-profile-avatar">
          {avatarUrl ? <img src={avatarUrl} alt="" /> : <CircleUserRound size={42} aria-hidden="true" />}
        </div>
        <div className="creator-profile-identity">
          <p className="creator-profile-eyebrow">TASKFLOW MEMBER</p>
          <h1>{profile.name}</h1>
          <p className="creator-profile-username">@{profile.username}</p>
          <p className="creator-profile-bio">{profile.bio || "This member hasn’t added a bio yet."}</p>
          <span className={`creator-level creator-level-${(profile.creatorLevel || "New Creator").toLowerCase().replaceAll(" ", "-")}`}><Trophy size={14} /> {profile.creatorLevel || "New Creator"}</span>
          <span className="creator-profile-joined"><CalendarDays size={15} /> Joined {dateLabel(profile.createdAt)}</span>
          {currentAvatar?.error && <span className="creator-profile-username" role="status">Profile image unavailable</span>}
          {profile.id !== currentUser?.id && (
            <button type="button" className="discovery-follow-button" onClick={toggleFollow} disabled={followLoading}>
              {followLoading ? <LoaderCircle size={15} className="animate-spin" /> : null}
              {following ? "Unfollow" : "Follow"}
            </button>
          )}
        </div>
      </header>

      <section className="creator-profile-stats" aria-label="Public profile statistics">
        {stats.map(({ key, label, value, icon: Icon }) => (
          <div className="creator-profile-stat" key={label}>
            <Icon size={18} aria-hidden="true" />
            <strong>{Number(value || 0).toLocaleString()}</strong>
            {key
              ? <Link to={`/users/${encodeURIComponent(profile.username)}/${key}`} className="creator-profile-stat-link">{label}</Link>
              : <span>{label}</span>}
          </div>
        ))}
      </section>

      {error && <p className="creator-profile-error" role="alert">{error}</p>}
      <section className="creator-public-notes" aria-labelledby="creator-public-notes-title">
        <div className="creator-public-notes-heading">
          <div><h2 id="creator-public-notes-title">Public notes</h2><p>{notesTotal.toLocaleString()} published notes</p></div>
          {notesLoading && <span role="status"><LoaderCircle size={16} className="animate-spin" /> Loading</span>}
        </div>
        {notesError && <p className="creator-profile-error" role="alert">{notesError} <button type="button" onClick={() => setNotesReload((value) => value + 1)} disabled={notesLoading}>Try again</button></p>}
        {notesLoading && publicNotes.length === 0 ? (
          <div className="creator-public-notes-grid" aria-label="Loading public notes">
            {[0, 1, 2].map((item) => <div className="creator-public-note-skeleton" key={item}><span /><span /><span /></div>)}
          </div>
        ) : publicNotes.length ? (
          <div className="creator-public-notes-grid">
            {publicNotes.map((note) => (
              <article className="creator-public-note" key={note.id}>
                <h3><Link to={`/notes/${encodeURIComponent(note.id)}`}>{note.title}</Link></h3>
                <p>{note.description || "No description provided."}</p>
                <div className="creator-public-note-categories">
                  {(note.categories || []).map((category) => <span key={category.id}>{category.name}</span>)}
                </div>
                <span className="creator-public-note-date">
                  {new Date(note.publishedAt || note.createdAt).toLocaleDateString()}
                </span>
              </article>
            ))}
          </div>
        ) : !notesError && !notesLoading ? (
          <div className="creator-public-notes-empty"><p>No public notes yet.</p></div>
        ) : null}
        {!notesLoading && notesTotal > 12 && (
          <nav className="discovery-pagination" aria-label="Public notes pages">
            <button type="button" onClick={() => setNotesPage((page) => page - 1)} disabled={notesPage <= 1}>Previous</button>
            <span>Page {notesPage} of {Math.ceil(notesTotal / 12)}</span>
            <button type="button" onClick={() => setNotesPage((page) => page + 1)} disabled={notesPage >= Math.ceil(notesTotal / 12)}>Next</button>
          </nav>
        )}
      </section>
      <p className="creator-profile-back"><Link to="/social">Back to Social</Link></p>
    </div>
  );
}
