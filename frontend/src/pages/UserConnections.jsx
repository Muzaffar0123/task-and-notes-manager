import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CircleUserRound, LoaderCircle, UsersRound } from "lucide-react";
import api, { getApiError } from "../services/api";
import "./DiscoveryPages.css";

const PAGE_SIZE = 20;

export default function UserConnections({ direction }) {
  const { username } = useParams();
  const [profile, setProfile] = useState(null);
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const profileResponse = await api.get(`/api/social/profiles/${encodeURIComponent(username)}`);
      const member = profileResponse.data.data;
      setProfile(member);
      const response = await api.get(`/api/social/follows/${direction}`, {
        params: { userId: member.id, page, pageSize: PAGE_SIZE },
      });
      setUsers(response.data.data.map((item) => item.user));
      setTotal(response.data.pagination.total);
    } catch (requestError) {
      setUsers([]);
      setError(getApiError(requestError));
    } finally {
      setLoading(false);
    }
  }, [direction, page, username]);

  useEffect(() => {
    const timer = window.setTimeout(loadPage, 0);
    return () => window.clearTimeout(timer);
  }, [loadPage]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const title = direction === "followers" ? "Followers" : "Following";

  return (
    <div className="discovery-page">
      <header className="discovery-heading">
        <div><p className="discovery-eyebrow"><Link to={`/users/${encodeURIComponent(username)}`}>@{username}</Link></p><h1>{title}</h1><p>{profile ? `${profile.name}’s ${title.toLowerCase()} list` : "Loading member…"}</p></div>
      </header>
      {error && <div className="discovery-error" role="alert">{error}<button type="button" onClick={loadPage}>Try again</button></div>}
      {loading ? (
        <p className="discovery-state" role="status"><LoaderCircle className="animate-spin" size={20} /> Loading {title.toLowerCase()}…</p>
      ) : users.length ? (
        <section className="connection-list">
          {users.map((user) => (
            <Link to={`/users/${encodeURIComponent(user.username)}`} className="connection-card" key={user.id}>
              <span className="discovery-avatar"><CircleUserRound size={25} aria-hidden="true" /></span>
              <span><strong>{user.name}</strong><small>@{user.username}</small></span>
              <span className="connection-card-bio">{user.bio || "TaskFlow member"}</span>
            </Link>
          ))}
        </section>
      ) : !error ? (
        <section className="discovery-empty"><UsersRound size={28} /><h2>No {title.toLowerCase()} to show</h2><p>This list is empty or no members appear on this page.</p></section>
      ) : null}
      {!loading && total > PAGE_SIZE && (
        <nav className="discovery-pagination" aria-label={`${title} pages`}>
          <button type="button" onClick={() => setPage((current) => current - 1)} disabled={page <= 1}>Previous</button>
          <span>Page {page} of {pageCount}</span>
          <button type="button" onClick={() => setPage((current) => current + 1)} disabled={page >= pageCount}>Next</button>
        </nav>
      )}
    </div>
  );
}
