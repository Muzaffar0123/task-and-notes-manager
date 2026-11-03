import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CircleUserRound, LoaderCircle, Trophy } from "lucide-react";
import api, { getApiError } from "../services/api";
import "./DiscoveryPages.css";

const PAGE_SIZE = 12;

function CreatorCard({ creator }) {
  const [avatar, setAvatar] = useState("");
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    if (!creator.hasProfileImage) return undefined;
    api.get(`/api/users/${encodeURIComponent(creator.id)}/public-profile/image`, { responseType: "blob" })
      .then((response) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(response.data);
        setAvatar(objectUrl);
      })
      .catch(() => {});
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [creator.hasProfileImage, creator.id]);

  return (
    <article className="popular-creator-card">
      <span className="discovery-avatar">{avatar ? <img src={avatar} alt="" /> : <CircleUserRound size={23} />}</span>
      <div className="popular-creator-main">
        <Link to={`/users/${encodeURIComponent(creator.username)}`}>{creator.name}</Link>
        <span>@{creator.username}</span>
        <span className={`creator-level creator-level-${creator.creatorLevel.toLowerCase().replaceAll(" ", "-")}`}>
          <Trophy size={14} /> {creator.creatorLevel}
        </span>
      </div>
      <p className="discovery-user-bio">{creator.bio || "TaskFlow creator"}</p>
      <footer>
        <span><strong>{creator.popularityScore.toLocaleString()}</strong> score</span>
        <span>{creator.totalLikesReceived} likes</span>
        <span>{creator.totalRatings} ratings · {Number(creator.averageRating).toFixed(1)} avg</span>
      </footer>
    </article>
  );
}

export default function PopularCreators() {
  const [creators, setCreators] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadCreators = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/api/social/creators/popular", { params: { page, pageSize: PAGE_SIZE } });
      setCreators(response.data.data);
      setTotal(response.data.pagination.total);
    } catch (requestError) {
      setCreators([]);
      setError(getApiError(requestError));
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadCreators(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCreators]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="discovery-page">
      <header className="discovery-heading">
        <div><p className="discovery-eyebrow">CREATOR COMMUNITY</p><h1>Popular creators</h1><p>Ranked by likes and star points received on public notes.</p></div>
      </header>
      {error && <div className="discovery-error" role="alert">{error}<button type="button" onClick={loadCreators}>Try again</button></div>}
      {loading
        ? <p className="discovery-state" role="status"><LoaderCircle className="animate-spin" size={20} /> Loading creators…</p>
        : creators.length
          ? <section className="popular-creators-grid">{creators.map((creator) => <CreatorCard key={creator.id} creator={creator} />)}</section>
          : <section className="discovery-empty"><Trophy size={28} /><h2>No ranked creators yet</h2><p>Creator rankings appear as public notes receive likes and ratings.</p></section>}
      {!loading && total > PAGE_SIZE && (
        <nav className="discovery-pagination" aria-label="Creator pages">
          <button type="button" onClick={() => setPage((value) => value - 1)} disabled={page <= 1}>Previous</button>
          <span>Page {page} of {pageCount}</span>
          <button type="button" onClick={() => setPage((value) => value + 1)} disabled={page >= pageCount}>Next</button>
        </nav>
      )}
    </main>
  );
}
