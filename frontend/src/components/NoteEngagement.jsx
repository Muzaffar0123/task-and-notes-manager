import { useCallback, useEffect, useState } from "react";
import { Heart, Star } from "lucide-react";
import api, { getApiError } from "../services/api";
import { useAuth } from "../context/useAuth";

export default function NoteEngagement({ noteId, ownerId }) {
  const { user } = useAuth();
  const [engagement, setEngagement] = useState(null);
  const [rating, setRating] = useState({ average: 0, count: 0, myRating: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [engagementResponse, ratingResponse] = await Promise.all([
        api.get(`/api/social/notes/${encodeURIComponent(noteId)}/engagement`),
        api.get(`/api/social/notes/${encodeURIComponent(noteId)}/ratings`),
      ]);
      setEngagement(engagementResponse.data.data);
      setRating(ratingResponse.data.data);
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  }, [noteId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function toggleLike() {
    setBusy(true);
    setError("");
    try {
      if (engagement?.likedByMe) {
        await api.delete(`/api/social/notes/${encodeURIComponent(noteId)}/likes`);
      } else {
        await api.post(`/api/social/notes/${encodeURIComponent(noteId)}/likes`);
      }
      await load();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function submitRating(value) {
    setBusy(true);
    setError("");
    try {
      await api.put(`/api/social/notes/${encodeURIComponent(noteId)}/ratings`, { value });
      await load();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setBusy(false);
    }
  }

  const canEngage = user?.id !== ownerId;
  return (
    <div className="note-engagement">
      <div className="note-engagement-actions">
        <button
          type="button"
          className={`note-like-button ${engagement?.likedByMe ? "is-liked" : ""}`}
          onClick={toggleLike}
          disabled={!canEngage || busy || !engagement}
          aria-pressed={Boolean(engagement?.likedByMe)}
          aria-label={engagement?.likedByMe ? "Unlike note" : "Like note"}
        >
          <Heart size={16} fill={engagement?.likedByMe ? "currentColor" : "none"} />
          {engagement?.likeCount ?? "—"}
        </button>
        <span className="note-rating-summary">
          <Star size={15} /> {Number(rating.average || 0).toFixed(1)} ({rating.count || 0})
        </span>
      </div>
      {canEngage && (
        <div className="note-rating-control" role="group" aria-label="Rate this note">
          {Array.from({ length: 5 }, (_, index) => {
            const value = index + 1;
            return (
              <button
                key={value}
                type="button"
                onClick={() => submitRating(value)}
                disabled={busy}
                aria-label={`Rate ${value} out of 5 stars`}
                aria-pressed={rating.myRating === value}
              >
                <Star size={17} fill={rating.myRating >= value ? "currentColor" : "none"} />
              </button>
            );
          })}
        </div>
      )}
      {error && <span className="note-engagement-error" role="alert">{error}</span>}
    </div>
  );
}
