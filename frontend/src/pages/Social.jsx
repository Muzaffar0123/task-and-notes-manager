import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bookmark, BookmarkCheck, ChevronDown, ChevronUp, CircleUserRound,
  Compass, Heart, LoaderCircle, MessageCircle, Plus, RefreshCw, Send,
  Sparkles, Star, Trash2, UsersRound, X,
} from "lucide-react";
import { useAuth } from "../context/useAuth";
import api, { getApiError } from "../services/api";

const PAGE_SIZE = 10;
const socialViews = [
  ["feed", "Your feed", UsersRound],
  ["explore", "Explore", Compass],
  ["trending", "Trending", Sparkles],
  ["bookmarks", "Bookmarks", Bookmark],
];

function normalizeItem(item) {
  if (item.note) return { ...item.note, engagement: item.engagement || null, bookmarkId: item.id || null };
  return item;
}

function dateLabel(value) {
  if (!value) return "Recently";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Recently" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function AuthorAvatar({ author, onClick }) {
  const [avatar, setAvatar] = useState(null);

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    if (!author?.id || !author.hasProfileImage) return undefined;

    api.get(`/api/users/${encodeURIComponent(author.id)}/public-profile/image`, { responseType: "blob" })
      .then((response) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(response.data);
        setAvatar({ userId: author.id, url: objectUrl });
      })
      .catch(() => {
        if (active) setAvatar({ userId: author.id, url: "" });
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [author?.hasProfileImage, author?.id]);

  const avatarUrl = avatar?.userId === author?.id ? avatar?.url || "" : "";
  return (
    <button
      type="button"
      className="social-avatar"
      onClick={onClick}
      aria-label={`View ${author?.name || "author"} profile`}
    >
      {avatarUrl ? <img src={avatarUrl} alt="" /> : <CircleUserRound size={20} aria-hidden="true" />}
    </button>
  );
}

function NoteCard({ note, author, currentUserId, following, bookmarkId, collectionItemId, collections, onFollow, onBookmark, onAddToCollection, onRemoveFromCollection, onProfile }) {
  const [likes, setLikes] = useState({ count: note.engagement?.likeCount || 0, likedByMe: false });
  const [rating, setRating] = useState({ average: note.engagement?.ratingAverage || 0, count: note.engagement?.ratingCount || 0, myRating: null });
  const [comments, setComments] = useState([]);
  const [commentsTotal, setCommentsTotal] = useState(note.engagement?.commentCount || 0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [commentNames, setCommentNames] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadEngagement = useCallback(async () => {
    try {
      const [likeResponse, ratingResponse] = await Promise.all([
        api.get(`/api/social/notes/${note.id}/likes`),
        api.get(`/api/social/notes/${note.id}/ratings`),
      ]);
      setLikes(likeResponse.data.data);
      setRating(ratingResponse.data.data);
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  }, [note.id]);

  useEffect(() => {
    const timer = window.setTimeout(loadEngagement, 0);
    return () => window.clearTimeout(timer);
  }, [loadEngagement]);

  async function loadComments() {
    try {
      const response = await api.get(`/api/social/notes/${note.id}/comments`, { params: { page: 1, pageSize: 50 } });
      setComments(response.data.data);
      setCommentsTotal(response.data.pagination.total);
      const ids = [...new Set(response.data.data.flatMap((comment) => [comment.userId, ...(comment.replies || []).map((reply) => reply.userId)]))];
      const profiles = await Promise.all(ids.map(async (id) => {
        try { return [id, (await api.get(`/api/users/${id}/public-profile`)).data.user]; }
        catch { return [id, null]; }
      }));
      setCommentNames(Object.fromEntries(profiles.filter(([, profile]) => profile).map(([id, profile]) => [id, profile.name])));
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  }

  async function toggleComments() {
    const open = !commentsOpen;
    setCommentsOpen(open);
    if (open) await loadComments();
  }

  async function toggleLike() {
    setBusy(true); setError("");
    try {
      if (likes.likedByMe) {
        await api.delete(`/api/social/notes/${note.id}/likes`);
        setLikes((state) => ({ ...state, likedByMe: false, count: Math.max(0, state.count - 1) }));
      } else {
        await api.post(`/api/social/notes/${note.id}/likes`);
        setLikes((state) => ({ ...state, likedByMe: true, count: state.count + 1 }));
      }
    } catch (requestError) { setError(getApiError(requestError)); }
    finally { setBusy(false); }
  }

  async function saveRating(value) {
    setBusy(true); setError("");
    try {
      await api.put(`/api/social/notes/${note.id}/ratings`, { value });
      setRating((state) => ({ ...state, myRating: value, count: state.myRating ? state.count : state.count + 1, average: state.count ? ((state.average * state.count) + value - (state.myRating || 0)) / (state.count + (state.myRating ? 0 : 1)) : value }));
    } catch (requestError) { setError(getApiError(requestError)); }
    finally { setBusy(false); }
  }

  async function submitComment(event) {
    event.preventDefault();
    if (!commentText.trim()) return;
    setBusy(true); setError("");
    try {
      await api.post(`/api/social/notes/${note.id}/comments`, { content: commentText.trim(), parentId: replyTo?.id || null });
      setCommentText(""); setReplyTo(null);
      await loadComments();
    } catch (requestError) { setError(getApiError(requestError)); }
    finally { setBusy(false); }
  }

  async function deleteComment(comment) {
    if (!window.confirm("Delete this comment?")) return;
    setError("");
    try { await api.delete(`/api/social/notes/${note.id}/comments/${comment.id}`); await loadComments(); }
    catch (requestError) { setError(getApiError(requestError)); }
  }

  return (
    <article className="social-note-card">
      <header className="social-note-author">
        <AuthorAvatar author={author} onClick={() => onProfile(note.ownerId)} />
        <div className="social-author-copy"><button type="button" onClick={() => onProfile(note.ownerId)}>{author?.name || "TaskFlow member"}</button><span>{author?.username ? `@${author.username} · ` : ""}Shared {dateLabel(note.publishedAt || note.createdAt)}</span></div>
        {note.ownerId !== currentUserId && <button type="button" className={`social-follow-button ${following ? "is-following" : ""}`} onClick={() => onFollow(note.ownerId, following)}>{following ? "Following" : "Follow"}</button>}
      </header>
      <div className="social-note-content"><h2>{note.title}</h2><p>{note.description}</p><div className="social-note-tags">{(note.categories || []).map((category) => <span key={category.id}>{category.name}</span>)}{(note.tags || []).map((tag) => <span key={tag.id}>#{tag.name}</span>)}</div></div>
      <div className="social-note-stats"><span><Heart size={13} />{likes.count} likes</span><span><MessageCircle size={13} />{commentsTotal} comments</span><span><Star size={13} />{rating.average ? Number(rating.average).toFixed(1) : "—"} ({rating.count})</span></div>
      <div className="social-note-actions">{note.ownerId !== currentUserId && <><button type="button" className={likes.likedByMe ? "is-active" : ""} onClick={toggleLike} disabled={busy}><Heart size={16} fill={likes.likedByMe ? "currentColor" : "none"} />Like</button><div className="social-rate"><span>Rate</span>{[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} aria-label={`Rate ${value} out of 5`} title={`${value} stars`} className={value <= (rating.myRating || 0) ? "is-active" : ""} onClick={() => saveRating(value)} disabled={busy}><Star size={14} fill={value <= (rating.myRating || 0) ? "currentColor" : "none"} /></button>)}</div></>}<Link className="social-note-view" to={`/notes/${encodeURIComponent(note.id)}`}>View note</Link><button type="button" onClick={toggleComments}><MessageCircle size={16} />Comment</button><button type="button" className={bookmarkId ? "is-active" : ""} onClick={() => onBookmark(note.id, bookmarkId)}>{bookmarkId ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}{bookmarkId ? "Saved" : "Save"}</button>{bookmarkId && collections.length > 0 && <select aria-label={`Add ${note.title} to collection`} defaultValue="" onChange={(event) => { if (event.target.value) onAddToCollection(event.target.value, bookmarkId); event.target.value = ""; }}><option value="">Add to collection…</option>{collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select>}{collectionItemId && <button type="button" onClick={() => onRemoveFromCollection(note, collectionItemId)}><Trash2 size={14} />Remove from collection</button>}</div>
      {error && <p className="social-inline-error" role="alert">{error}</p>}
      {commentsOpen && <section className="social-comments"><div className="social-comments-heading"><h3>Comments</h3><button type="button" onClick={() => setCommentsOpen(false)} aria-label="Hide comments"><ChevronUp size={16} /></button></div><form className="social-comment-form" onSubmit={submitComment}><input value={commentText} onChange={(event) => setCommentText(event.target.value)} maxLength={5000} placeholder={replyTo ? `Reply to ${commentNames[replyTo.userId] || "comment"}…` : "Write a comment…"} aria-label="Write a comment" />{replyTo && <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply"><X size={15} /></button>}<button type="submit" disabled={busy || !commentText.trim()} aria-label="Send comment"><Send size={15} /></button></form><div className="social-comment-list">{comments.length ? comments.map((comment) => <div className="social-comment-thread" key={comment.id}><div className="social-comment"><strong>{commentNames[comment.userId] || "TaskFlow member"}</strong><p>{comment.content}</p><div><button type="button" onClick={() => setReplyTo(comment)}>Reply</button>{comment.userId === currentUserId && <button type="button" onClick={() => deleteComment(comment)}>Delete</button>}</div></div>{comment.replies?.map((reply) => <div className="social-comment is-reply" key={reply.id}><strong>{commentNames[reply.userId] || "TaskFlow member"}</strong><p>{reply.content}</p><div><button type="button" onClick={() => setReplyTo(comment)}>Reply</button>{reply.userId === currentUserId && <button type="button" onClick={() => deleteComment(reply)}>Delete</button>}</div></div>)}</div>) : <p className="social-no-comments">Be the first to join the conversation.</p>}</div></section>}
    </article>
  );
}

function ProfileDialog({ profile, onClose, onFollow, following, currentUserId }) {
  if (!profile) return null;
  return <div className="social-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="social-profile-dialog" role="dialog" aria-modal="true" aria-labelledby="social-profile-name"><button className="social-dialog-close" type="button" onClick={onClose} aria-label="Close profile"><X size={18} /></button><div className="social-profile-avatar"><CircleUserRound size={34} /></div><p className="social-eyebrow">PUBLIC PROFILE</p><h2 id="social-profile-name">{profile.name}</h2><p>@{profile.username}</p><p>Member since {dateLabel(profile.createdAt)}</p>{profile.id !== currentUserId && <button type="button" className="social-follow-button" onClick={() => onFollow(profile.id, following)}>{following ? "Following" : "Follow"}</button>}<Link className="social-follow-button" to={`/users/${encodeURIComponent(profile.username)}`} onClick={onClose}>View full profile</Link></section></div>;
}

export default function Social() {
  const { user } = useAuth();
  const [view, setView] = useState("feed");
  const [notes, setNotes] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [followingIds, setFollowingIds] = useState(new Set());
  const [bookmarkMap, setBookmarkMap] = useState({});
  const [collections, setCollections] = useState([]);
  const [collectionItems, setCollectionItems] = useState(null);
  const [selectedCollection, setSelectedCollection] = useState("");
  const [collectionName, setCollectionName] = useState("");
  const [authors, setAuthors] = useState({});
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState("");

  const loadNotes = useCallback(async () => {
    const params = { page, pageSize: PAGE_SIZE };
    let response;
    if (view === "feed") response = await api.get("/api/social/feed", { params });
    else if (view === "trending") response = await api.get("/api/social/trending", { params });
    else if (view === "bookmarks") response = await api.get("/api/social/bookmarks", { params });
    else {
      if (search.trim()) params.search = search.trim();
      params.sortBy = sortBy;
      params.sortOrder = "desc";
      response = await api.get("/api/notes/search", { params });
    }
    setNotes(response.data.data.map(normalizeItem));
    setTotal(response.data.pagination.total);
  }, [page, search, sortBy, view]);

  const loadConnections = useCallback(async () => {
    const response = await api.get("/api/social/follows/following", { params: { page: 1, pageSize: 100 } });
    setFollowingIds(new Set(response.data.data.map((item) => item.followeeId)));
  }, []);

  const loadBookmarks = useCallback(async () => {
    const response = await api.get("/api/social/bookmarks", { params: { page: 1, pageSize: 50 } });
    const pageCount = Math.ceil(response.data.pagination.total / 50);
    const remaining = await Promise.all(Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) =>
      api.get("/api/social/bookmarks", { params: { page: index + 2, pageSize: 50 } })
    ));
    const allBookmarks = [
      ...response.data.data,
      ...remaining.flatMap((pageResponse) => pageResponse.data.data),
    ];
    setBookmarkMap(Object.fromEntries(allBookmarks.map((item) => [item.noteId, item.id])));
  }, []);

  const loadCollections = useCallback(async () => {
    const response = await api.get("/api/social/collections", { params: { page: 1, pageSize: 100 } });
    setCollections(response.data.data);
  }, []);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const params = { page, pageSize: PAGE_SIZE };
        let response;
        if (view === "feed") response = await api.get("/api/social/feed", { params });
        else if (view === "trending") response = await api.get("/api/social/trending", { params });
        else if (view === "bookmarks") response = await api.get("/api/social/bookmarks", { params });
        else {
          if (search.trim()) params.search = search.trim();
          params.sortBy = sortBy; params.sortOrder = "desc";
          response = await api.get("/api/notes/search", { params });
        }
        if (!active) return;
        setNotes(response.data.data.map(normalizeItem)); setTotal(response.data.pagination.total);
      } catch (loadError) { if (active) setError(getApiError(loadError)); }
      finally { if (active) setLoading(false); }
    }, search ? 250 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [page, search, sortBy, view]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadConnections().catch((loadError) => setError(getApiError(loadError)));
      loadBookmarks().catch((loadError) => setError(getApiError(loadError)));
      loadCollections().catch((loadError) => setError(getApiError(loadError)));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadBookmarks, loadCollections, loadConnections]);

  useEffect(() => {
    let active = true;
    const missing = [...new Set(notes.map((note) => note.ownerId).filter((id) => id && !(id in authors)))];
    if (!missing.length) return undefined;
    Promise.all(missing.map(async (id) => {
      try { return [id, (await api.get(`/api/users/${id}/public-profile`)).data.user]; }
      catch { return [id, null]; }
    })).then((entries) => { if (active) setAuthors((current) => ({ ...current, ...Object.fromEntries(entries) })); });
    return () => { active = false; };
  }, [authors, notes]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const following = useMemo(() => followingIds, [followingIds]);

  async function toggleFollow(userId, isFollowing) {
    setError("");
    try {
      if (isFollowing) await api.delete(`/api/social/follows/${userId}`);
      else await api.post("/api/social/follows", { followeeId: userId });
      setFollowingIds((current) => { const next = new Set(current); if (isFollowing) next.delete(userId); else next.add(userId); return next; });
      setNotice(isFollowing ? "You unfollowed this member." : "You are now following this member.");
      if (view === "feed") await loadNotes();
    } catch (requestError) { setError(getApiError(requestError)); }
  }

  async function toggleBookmark(noteId, bookmarkId) {
    setError("");
    try {
      if (bookmarkId) {
        await api.delete(`/api/social/notes/${noteId}/bookmark`);
        setBookmarkMap((current) => { const next = { ...current }; delete next[noteId]; return next; });
        if (view === "bookmarks") {
          setNotes((current) => current.filter((note) => note.id !== noteId));
          setTotal((current) => Math.max(0, current - 1));
        }
        if (selectedCollection) await showCollection(selectedCollection);
      } else {
        const response = await api.post(`/api/social/notes/${noteId}/bookmark`);
        setBookmarkMap((current) => ({ ...current, [noteId]: response.data.data.id }));
        setNotice("Note saved to your bookmarks.");
      }
    } catch (requestError) { setError(getApiError(requestError)); }
  }

  async function addToCollection(collectionId, bookmarkId) {
    try {
      await api.post(`/api/social/collections/${collectionId}/items`, { bookmarkId });
      setNotice("Bookmark added to collection.");
    } catch (requestError) { setError(getApiError(requestError)); }
  }

  async function removeFromCollection(note, collectionItemId) {
    try {
      await api.delete(`/api/social/collections/${selectedCollection}/items/${note.bookmarkId}`);
      setCollectionItems((current) => current?.filter((item) => item.id !== collectionItemId) || []);
      setCollections((current) => current.map((collection) => collection.id === selectedCollection ? { ...collection, _count: { items: Math.max(0, (collection._count?.items || 0) - 1) } } : collection));
      setNotice("Removed from collection.");
    } catch (requestError) { setError(getApiError(requestError)); }
  }

  async function createCollection(event) {
    event.preventDefault();
    try {
      const response = await api.post("/api/social/collections", { name: collectionName.trim() });
      setCollections((current) => [response.data.data, ...current]); setCollectionName(""); setNotice("Collection created.");
    } catch (requestError) { setError(getApiError(requestError)); }
  }

  async function renameCollection(collection) {
    const name = window.prompt("New collection name", collection.name);
    if (!name?.trim() || name.trim() === collection.name) return;
    try {
      const response = await api.patch(`/api/social/collections/${collection.id}`, { name: name.trim() });
      setCollections((current) => current.map((item) => item.id === collection.id ? { ...item, ...response.data.data } : item));
      setNotice("Collection renamed.");
    } catch (requestError) { setError(getApiError(requestError)); }
  }

  async function deleteCollection(collection) {
    if (!window.confirm(`Delete collection “${collection.name}”? Your bookmarks will stay saved.`)) return;
    try {
      await api.delete(`/api/social/collections/${collection.id}`);
      setCollections((current) => current.filter((item) => item.id !== collection.id));
      if (selectedCollection === collection.id) { setSelectedCollection(""); setCollectionItems(null); }
    } catch (requestError) { setError(getApiError(requestError)); }
  }

  async function showCollection(collectionId) {
    setSelectedCollection(collectionId);
    if (!collectionId) { setCollectionItems(null); return; }
    try {
      const response = await api.get(`/api/social/collections/${collectionId}/items`, { params: { page: 1, pageSize: 50 } });
      setCollectionItems(response.data.data);
    } catch (requestError) { setError(getApiError(requestError)); }
  }

  async function openProfile(userId) {
    setProfileError(""); setProfile({ loading: true });
    try { setProfile((await api.get(`/api/users/${userId}/public-profile`)).data.user); }
    catch (requestError) { setProfile(null); setProfileError(getApiError(requestError)); }
  }

  const displayedNotes = selectedCollection && collectionItems
    ? collectionItems.map((item) => ({ ...item.note, bookmarkId: item.bookmark.id, collectionItemId: item.id }))
    : notes;
  const currentViewTitle = socialViews.find(([key]) => key === view)?.[1] || "Your feed";

  return (
    <div className="social-page">
      <header className="social-page-heading"><div><p className="social-eyebrow">TASKFLOW COMMUNITY</p><h1>Community feed</h1><p>Catch up on followed creators, explore new public notes, or browse what’s trending.</p></div><button type="button" className="social-refresh" onClick={() => { loadNotes().catch((loadError) => setError(getApiError(loadError))); loadConnections(); loadBookmarks(); }}><RefreshCw size={16} /> Refresh</button></header>
      {error && <div className="social-alert" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")}>Dismiss</button></div>}{notice && <div className="social-notice" role="status">{notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss"><X size={15} /></button></div>}
      <div className="social-layout">
        <aside className="social-sidebar"><nav aria-label="Social views">{socialViews.map(([key, label, Icon]) => <button type="button" key={key} className={view === key && !selectedCollection ? "is-active" : ""} onClick={() => { setSelectedCollection(""); setCollectionItems(null); setView(key); setPage(1); }}><Icon size={17} />{label}</button>)}</nav><section className="social-collections"><div className="social-collections-title"><h2>Collections</h2><ChevronDown size={15} /></div><form className="social-collection-create" onSubmit={createCollection}><input value={collectionName} onChange={(event) => setCollectionName(event.target.value)} maxLength={100} placeholder="New collection" aria-label="New collection name" required /><button type="submit" aria-label="Create collection"><Plus size={16} /></button></form>{collections.map((collection) => <div className="social-collection-item" key={collection.id}><button type="button" className={selectedCollection === collection.id ? "is-active" : ""} onClick={() => showCollection(collection.id)}>{collection.name}<span>{collection._count?.items ?? ""}</span></button><button type="button" onClick={() => renameCollection(collection)} aria-label={`Rename ${collection.name}`} title="Rename collection"><ChevronDown size={13} /></button><button type="button" onClick={() => deleteCollection(collection)} aria-label={`Delete ${collection.name}`} title="Delete collection"><Trash2 size={13} /></button></div>)}</section></aside>
        <main className="social-main"><div className="social-feed-heading"><div><h2>{selectedCollection ? collections.find((item) => item.id === selectedCollection)?.name || "Collection" : currentViewTitle}</h2><p>{selectedCollection ? "Saved public notes in this collection." : view === "feed" ? "Recent public notes from people you follow." : view === "trending" ? "Public notes readers are engaging with." : view === "bookmarks" ? "Public notes you saved for later." : "Search published public notes."}</p></div>{view === "explore" && !selectedCollection && <select aria-label="Sort public notes" value={sortBy} onChange={(event) => { setSortBy(event.target.value); setPage(1); }}><option value="createdAt">Newest</option><option value="popularityScore">Most popular</option></select>}</div>
          {view === "explore" && !selectedCollection && <label className="social-search"><Compass size={17} /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search public notes, categories, or tags…" aria-label="Search public notes" /></label>}
          {loading && !selectedCollection ? <div className="social-note-list" aria-label="Loading social notes">{Array.from({ length: 3 }, (_, index) => <div className="social-skeleton" key={index}><span /><span /><span /></div>)}</div> : displayedNotes.length ? <div className="social-note-list">{displayedNotes.map((note) => <NoteCard key={note.id} note={note} author={authors[note.ownerId]} currentUserId={user?.id} following={following.has(note.ownerId)} bookmarkId={bookmarkMap[note.id] || note.bookmarkId} collectionItemId={note.collectionItemId} collections={collections} onFollow={toggleFollow} onBookmark={toggleBookmark} onAddToCollection={addToCollection} onRemoveFromCollection={removeFromCollection} onProfile={openProfile} />)}</div> : <div className="social-empty"><Sparkles size={32} /><h2>{view === "feed" && !selectedCollection ? "Your feed is ready for people" : selectedCollection ? "Nothing in this collection yet" : "No notes to show yet"}</h2><p>{view === "feed" && !selectedCollection ? "Follow members whose public notes you want to see here, or explore the community." : view === "bookmarks" ? "Bookmark an eligible public note to keep it close." : "Try another search or come back when more public notes are available."}</p>{view === "feed" && <button type="button" className="social-refresh" onClick={() => { setView("explore"); setPage(1); }}>Explore public notes</button>}</div>}
          {!selectedCollection && total > PAGE_SIZE && <footer className="social-pagination"><span>Page {page} of {totalPages} · {total} notes</span><div><button type="button" onClick={() => setPage((value) => value - 1)} disabled={page <= 1}>Previous</button><button type="button" onClick={() => setPage((value) => value + 1)} disabled={page >= totalPages}>Next</button></div></footer>}
        </main>
      </div>
      {profile?.loading && <div className="social-dialog-backdrop"><section className="social-profile-dialog" role="status"><LoaderCircle className="animate-spin" /> Loading profile…</section></div>}{profile && !profile.loading && <ProfileDialog profile={profile} onClose={() => setProfile(null)} onFollow={toggleFollow} following={following.has(profile.id)} currentUserId={user?.id} />}{profileError && <div className="social-alert" role="alert">{profileError}<button type="button" onClick={() => setProfileError("")}>Dismiss</button></div>}
    </div>
  );
}
