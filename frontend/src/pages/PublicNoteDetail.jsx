import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CalendarDays, Download, FileText, LoaderCircle } from "lucide-react";
import api, { getApiError } from "../services/api";
import NoteEngagement from "../components/NoteEngagement";
import "./DiscoveryPages.css";

export default function PublicNoteDetail() {
  const { noteId } = useParams();
  const [note, setNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attachmentError, setAttachmentError] = useState("");
  const [downloadingFileId, setDownloadingFileId] = useState(null);

  useEffect(() => {
    let active = true;
    api.get(`/api/notes/${encodeURIComponent(noteId)}`)
      .then((response) => {
        const result = response.data.data;
        if (result.visibility !== "PUBLIC" || result.status !== "PUBLISHED") {
          throw new Error("This public note is unavailable.");
        }
        if (active) setNote(result);
      })
      .catch((requestError) => {
        if (active) setError(requestError.response ? getApiError(requestError) : requestError.message);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [noteId]);

  async function downloadAttachment(file) {
    setDownloadingFileId(file.id);
    setAttachmentError("");
    try {
      const response = await api.get(
        `/api/notes/${encodeURIComponent(note.id)}/files/${encodeURIComponent(file.id)}/download`,
        { responseType: "blob" },
      );
      const objectUrl = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = file.originalFilename;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (requestError) {
      setAttachmentError(getApiError(requestError));
    } finally {
      setDownloadingFileId(null);
    }
  }

  if (loading) {
    return <p className="discovery-state" role="status"><LoaderCircle className="animate-spin" size={20} /> Loading note…</p>;
  }
  if (!note) {
    return <section className="discovery-empty" role="alert"><h1>Note unavailable</h1><p>{error || "This public note could not be found."}</p><Link to="/explore">Back to Explore</Link></section>;
  }

  return (
    <article className="public-note-detail">
      <Link to="/explore" className="public-note-back">← Explore public notes</Link>
      <p className="discovery-eyebrow">PUBLIC NOTE</p>
      <h1>{note.title}</h1>
      <p className="public-note-date"><CalendarDays size={15} /> {new Date(note.publishedAt || note.createdAt).toLocaleDateString()}</p>
      <p className="public-note-description">{note.description}</p>
      <div className="explore-note-categories">
        {[...(note.categories || []).map((item) => item.name), ...(note.tags || []).map((item) => `#${item.name}`)]
          .map((label) => <span key={label}>{label}</span>)}
      </div>
      {note.files?.length > 0 && (
        <section className="public-note-attachments" aria-labelledby="public-note-attachments-title">
          <h2 id="public-note-attachments-title">Attachments</h2>
          {attachmentError && <p className="public-note-attachment-error" role="alert">{attachmentError}</p>}
          <ul>
            {note.files.map((file) => (
              <li key={file.id}>
                <span><FileText size={16} aria-hidden="true" />{file.originalFilename}</span>
                <div>
                  <button
                    type="button"
                    onClick={() => downloadAttachment(file)}
                    disabled={downloadingFileId === file.id}
                    aria-label={`Download ${file.originalFilename}`}
                  >
                    {downloadingFileId === file.id
                      ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />
                      : <Download size={15} aria-hidden="true" />}
                    Download
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <NoteEngagement noteId={note.id} ownerId={note.ownerId} />
    </article>
  );
}
