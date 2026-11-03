import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CircleUserRound, LoaderCircle, Search, UsersRound } from "lucide-react";
import api, { getApiError } from "../services/api";
import "./DiscoveryPages.css";

const PAGE_SIZE = 12;

function UserAvatar({ user }) {
  const [image, setImage] = useState("");

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    if (!user.hasProfileImage) return undefined;
    api.get(`/api/users/${encodeURIComponent(user.id)}/public-profile/image`, { responseType: "blob" })
      .then((response) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(response.data);
        setImage(objectUrl);
      })
      .catch(() => {});
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [user.id, user.hasProfileImage]);

  return (
    <span className="discovery-avatar">
      {image ? <img src={image} alt="" /> : <CircleUserRound size={27} aria-hidden="true" />}
    </span>
  );
}

export default function DiscoverUsers() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/api/social/users/discover", {
        params: { search: query || undefined, page, pageSize: PAGE_SIZE },
      });
      setUsers(response.data.data);
      setTotal(response.data.pagination.total);
    } catch (requestError) {
      setError(getApiError(requestError));
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [page, query]);

  useEffect(() => {
    const timer = window.setTimeout(loadUsers, 0);
    return () => window.clearTimeout(timer);
  }, [loadUsers]);

  function submitSearch(event) {
    event.preventDefault();
    setPage(1);
    setQuery(search.trim());
  }

  async function toggleFollow(user) {
    setBusyId(user.id);
    setError("");
    try {
      if (user.following) await api.delete(`/api/social/follows/${encodeURIComponent(user.id)}`);
      else await api.post("/api/social/follows", { followeeId: user.id });
      setUsers((current) => current.map((item) => item.id === user.id
        ? { ...item, following: !item.following, followerCount: Math.max(0, item.followerCount + (item.following ? -1 : 1)) }
        : item));
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setBusyId("");
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="discovery-page">
      <header className="discovery-heading">
        <div><p className="discovery-eyebrow">TASKFLOW COMMUNITY</p><h1>Discover people</h1><p>Find members and follow creators whose public notes interest you.</p></div>
      </header>
      <form className="discovery-search" onSubmit={submitSearch}>
        <Search size={18} aria-hidden="true" />
        <input aria-label="Search users" placeholder="Search username or display name" maxLength={80} value={search} onChange={(event) => setSearch(event.target.value)} />
        <button type="submit">Search</button>
      </form>
      {error && <div className="discovery-error" role="alert">{error}<button type="button" onClick={loadUsers}>Try again</button></div>}
      {loading ? (
        <p className="discovery-state" role="status"><LoaderCircle className="animate-spin" size={20} /> Loading users…</p>
      ) : users.length ? (
        <section className="discovery-users-grid" aria-label="Discovered users">
          {users.map((user) => (
            <article className="discovery-user-card" key={user.id}>
              <UserAvatar user={user} />
              <div className="discovery-user-main">
                <Link to={`/users/${encodeURIComponent(user.username)}`} className="discovery-user-name">{user.name}</Link>
                <span className="discovery-user-handle">@{user.username}</span>
              </div>
              <p className="discovery-user-bio">{user.bio || "No bio yet."}</p>
              <div className="discovery-user-footer">
                <span><UsersRound size={15} />{user.followerCount.toLocaleString()} followers</span>
                <button type="button" className={user.following ? "is-following" : ""} onClick={() => toggleFollow(user)} disabled={busyId === user.id}>
                  {busyId === user.id ? <LoaderCircle size={15} className="animate-spin" /> : null}
                  {user.following ? "Following" : "Follow"}
                </button>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="discovery-empty"><UsersRound size={28} /><h2>No members found</h2><p>{query ? "Try a different username or display name." : "There are no members to suggest right now."}</p></section>
      )}
      {!loading && total > PAGE_SIZE && (
        <nav className="discovery-pagination" aria-label="User pages">
          <button type="button" onClick={() => setPage((current) => current - 1)} disabled={page <= 1}>Previous</button>
          <span>Page {page} of {pageCount}</span>
          <button type="button" onClick={() => setPage((current) => current + 1)} disabled={page >= pageCount}>Next</button>
        </nav>
      )}
    </div>
  );
}
