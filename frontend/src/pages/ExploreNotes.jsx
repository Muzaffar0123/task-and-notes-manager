import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, CircleUserRound, FileText, LoaderCircle, Search } from "lucide-react";
import api, { getApiError } from "../services/api";
import NoteEngagement from "../components/NoteEngagement";
import "./DiscoveryPages.css";

const PAGE_SIZE = 12;

function formatDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "Recently";
}

function ExploreNoteCard({ note }) {
  const [author, setAuthor] = useState(null);
  const [avatar, setAvatar] = useState("");

  useEffect(() => {
    let active = true;
    api.get(`/api/users/${encodeURIComponent(note.ownerId)}/public-profile`)
      .then((response) => {
        if (active) setAuthor(response.data.user);
      })
      .catch(() => {
        if (active) setAuthor(null);
      });
    return () => { active = false; };
  }, [note.id, note.ownerId]);

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    if (!author?.hasProfileImage) return undefined;
    api.get(`/api/users/${encodeURIComponent(note.ownerId)}/public-profile/image`, { responseType: "blob" })
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
  }, [author?.hasProfileImage, note.ownerId]);

  const categoryNames = [...(note.categories || []).map((item) => item.name), ...(note.tags || []).map((item) => `#${item.name}`)];
  return (
    <article className="explore-note-card">
      <div className="explore-note-byline">
        {avatar ? <img className="explore-note-avatar" src={avatar} alt="" /> : <span className="explore-note-avatar explore-note-avatar-fallback"><CircleUserRound size={22} /></span>}
        <span className="explore-note-author">
          {author
            ? <Link to={`/users/${encodeURIComponent(author.username)}`}>{author.name} <small>@{author.username}</small></Link>
            : <span>TaskFlow member</span>}
        </span>
        <span className="explore-note-date"><CalendarDays size={14} />{formatDate(note.publishedAt || note.createdAt)}</span>
      </div>
      <h2><Link to={`/notes/${encodeURIComponent(note.id)}`}>{note.title}</Link></h2>
      <p className="explore-note-description">{note.description || "No description provided."}</p>
      {categoryNames.length > 0 && <div className="explore-note-categories">{categoryNames.map((name) => <span key={name}>{name}</span>)}</div>}
      <footer className="explore-note-stats">
        <NoteEngagement noteId={note.id} ownerId={note.ownerId} />
      </footer>
    </article>
  );
}

export default function ExploreNotes() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [page, setPage] = useState(1);
  const [notes, setNotes] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadNotes = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/api/social/notes/discover", {
        params: {
          search: search.trim() || undefined,
          category: category.trim() || undefined,
          sortBy,
          page,
          pageSize: PAGE_SIZE,
        },
      });
      setNotes(response.data.data);
      setTotal(response.data.pagination.total);
    } catch (requestError) {
      setError(getApiError(requestError));
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [category, page, search, sortBy]);

  useEffect(() => {
    const timer = window.setTimeout(loadNotes, search ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [loadNotes, search]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="discovery-page">
      <header className="discovery-heading">
        <div><p className="discovery-eyebrow">PUBLIC NOTES</p><h1>Explore notes</h1><p>Browse public notes from TaskFlow members, or see <Link to="/social">notes from people you follow</Link>.</p></div>
      </header>
      <section className="discovery-toolbar" aria-label="Public note filters">
        <label className="discovery-search"><Search size={18} aria-hidden="true" /><input value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} maxLength={200} placeholder="Search public notes" aria-label="Search public notes" /></label>
        <label className="discovery-filter">Category or subject<input value={category} onChange={(event) => { setPage(1); setCategory(event.target.value); }} maxLength={80} placeholder="e.g. Science" /></label>
        <label className="discovery-filter">Sort by<select value={sortBy} onChange={(event) => { setPage(1); setSortBy(event.target.value); }}><option value="createdAt">Latest</option><option value="popularityScore">Popular (existing score)</option></select></label>
      </section>
      {error && <div className="discovery-error" role="alert">{error}<button type="button" onClick={loadNotes}>Try again</button></div>}
      {loading ? (
        <p className="discovery-state" role="status"><LoaderCircle className="animate-spin" size={20} /> Loading public notes…</p>
      ) : notes.length ? (
        <section className="explore-notes-grid" aria-label="Public notes">
          {notes.map((note) => <ExploreNoteCard key={note.id} note={note} />)}
        </section>
      ) : (
        <section className="discovery-empty"><FileText size={28} /><h2>No public notes found</h2><p>Try another search or category.</p></section>
      )}
      {!loading && total > PAGE_SIZE && (
        <nav className="discovery-pagination" aria-label="Public note pages">
          <button type="button" onClick={() => setPage((current) => current - 1)} disabled={page <= 1}>Previous</button>
          <span>Page {page} of {pageCount}</span>
          <button type="button" onClick={() => setPage((current) => current + 1)} disabled={page >= pageCount}>Next</button>
        </nav>
      )}
    </div>
  );
}
