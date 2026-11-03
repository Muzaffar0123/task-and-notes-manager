import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download, Eye, FileText, LoaderCircle, LockKeyhole,
  Pencil, Plus, RefreshCw, Search, Tag, Trash2, UploadCloud, X,
} from "lucide-react";
import api, { getApiError } from "../services/api";

const PAGE_SIZE = 20;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function splitNames(value) {
  return [...new Set(value.split(",").map((name) => name.trim()).filter(Boolean))];
}

function formatDate(value) {
  if (!value) return "Recently updated";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Recently updated" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function fileSize(value) {
  if (!Number.isFinite(value)) return "";
  return value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function NoteEditor({ note, onSave, onCancel }) {
  const [title, setTitle] = useState(note?.title || "");
  const [description, setDescription] = useState(note?.description || "");
  const [visibility, setVisibility] = useState(note?.visibility || "PRIVATE");
  const [categories, setCategories] = useState(note?.categories?.map((item) => item.name).join(", ") || "");
  const [tags, setTags] = useState(note?.tags?.map((item) => item.name).join(", ") || "");
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function pickFiles(event) {
    const selected = Array.from(event.target.files || []);
    const invalid = selected.find((file) => !/\.(pdf|docx?)$/i.test(file.name) || file.size > MAX_FILE_BYTES);
    if (invalid) {
      setError(`${invalid.name} is not supported or exceeds the 10 MB upload limit.`);
      event.target.value = "";
      return;
    }
    setFiles((current) => [...current, ...selected]);
    event.target.value = "";
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const result = await onSave({
        title: title.trim(),
        description,
        visibility,
        categories: splitNames(categories),
        tags: splitNames(tags),
      }, files);
      if (!result?.success) setError(result?.message || "Unable to save this note.");
    } catch (saveError) {
      setError(getApiError(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="notes-editor" onSubmit={submit}>
      <div className="notes-editor-heading"><div><p className="notes-eyebrow">{note ? "EDIT NOTE" : "NEW NOTE"}</p><h2>{note ? "Update your note" : "Capture an idea"}</h2></div><button type="button" className="notes-icon-button" onClick={onCancel} aria-label="Close note editor"><X size={18} /></button></div>
      <label className="notes-field">Title<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} required /></label>
      <label className="notes-field">Content<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={50000} rows={7} placeholder="Write your note..." /></label>
      <div className="notes-form-grid">
        <label className="notes-field">Visibility<select value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="PRIVATE">Private</option><option value="PUBLIC">Public</option></select></label>
        <label className="notes-field">Categories<input value={categories} onChange={(event) => setCategories(event.target.value)} placeholder="Work, Ideas" /></label>
        <label className="notes-field">Tags<input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="planning, research" /></label>
      </div>
      <label className="notes-upload-zone"><UploadCloud size={18} /><span>{files.length ? `${files.length} document${files.length === 1 ? "" : "s"} selected` : "Attach PDF, DOC, or DOCX · up to 10 MB each"}</span><input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple onChange={pickFiles} /></label>
      {files.length > 0 && <ul className="notes-selected-files">{files.map((file, index) => <li key={`${file.name}-${index}`}>{file.name}<button type="button" onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))} aria-label={`Remove ${file.name}`}><X size={14} /></button></li>)}</ul>}
      {error && <p className="notes-error" role="alert">{error}</p>}
      <div className="notes-editor-actions"><button type="submit" className="notes-primary-button" disabled={saving}>{saving && <LoaderCircle size={16} className="animate-spin" />}{saving ? "Saving…" : note ? "Save changes" : "Save draft"}</button><button type="button" className="notes-secondary-button" onClick={onCancel} disabled={saving}>Cancel</button></div>
    </form>
  );
}

function NoteCard({ note, onEdit, onDelete, onPublish, onUpload, onFileDelete, onFileOpen, busy }) {
  return (
    <article className="note-card">
      <div className="note-card-topline"><span className={`note-status status-${note.status?.toLowerCase()}`}>{note.status === "DRAFT" ? "Draft" : note.status === "RESTRICTED" ? "Restricted" : "Published"}</span><span className={`note-visibility ${note.visibility === "PRIVATE" ? "is-private" : "is-public"}`}>{note.visibility === "PRIVATE" ? <><LockKeyhole size={12} /> Private</> : "Public"}</span></div>
      <h2>{note.title}</h2>
      <p className="note-card-description">{note.description || "No content yet. Edit this note to add your thoughts."}</p>
      <div className="note-taxonomy">
        {note.categories?.map((category) => <span key={category.id}><FileText size={12} />{category.name}</span>)}
        {note.tags?.map((tag) => <span key={tag.id}><Tag size={12} />{tag.name}</span>)}
      </div>
      {note.files?.length > 0 && <ul className="note-file-list">{note.files.map((file) => <li key={file.id}><span className="note-file-name"><FileText size={14} />{file.originalFilename}<small>{fileSize(file.sizeBytes)}</small></span><span className="note-file-actions">{file.contentType === "application/pdf" && <button type="button" onClick={() => onFileOpen(note, file)} aria-label={`View ${file.originalFilename}`} title="View PDF"><Eye size={15} /></button>}<button type="button" onClick={() => onFileOpen(note, file, true)} aria-label={`Download ${file.originalFilename}`} title="Download"><Download size={15} /></button><button type="button" onClick={() => onFileDelete(note, file)} aria-label={`Delete ${file.originalFilename}`} title="Delete attachment" disabled={busy}><Trash2 size={14} /></button></span></li>)}</ul>}
      <div className="note-card-footer"><span>Updated {formatDate(note.updatedAt)}</span><div className="note-card-actions"><label className="notes-icon-button" title="Attach a document"><UploadCloud size={16} /><input className="visually-hidden-input" type="file" accept=".pdf,.doc,.docx" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(note, file); event.target.value = ""; }} /></label>{note.status === "DRAFT" && <button type="button" className="notes-small-action" onClick={() => onPublish(note)} disabled={busy}>Publish</button>}<button type="button" className="notes-icon-button" onClick={() => onEdit(note)} aria-label={`Edit ${note.title}`}><Pencil size={15} /></button><button type="button" className="notes-icon-button is-danger" onClick={() => onDelete(note)} aria-label={`Delete ${note.title}`} disabled={busy}><Trash2 size={15} /></button></div></div>
    </article>
  );
}

export default function Notes() {
  const [notes, setNotes] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: PAGE_SIZE, total: 0 });
  const [filters, setFilters] = useState({ search: "", visibility: "", status: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingNote, setEditingNote] = useState(null);
  const [creating, setCreating] = useState(false);
  const [busyNoteId, setBusyNoteId] = useState(null);

  const loadNotes = useCallback(async () => {
    const params = { page: pagination.page, pageSize: PAGE_SIZE };
    if (filters.visibility) params.visibility = filters.visibility;
    if (filters.status) params.status = filters.status;
    const response = await api.get("/api/notes/mine", { params });
    setNotes(response.data.data);
    setPagination(response.data.pagination);
  }, [filters.status, filters.visibility, pagination.page]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params = { page: pagination.page, pageSize: PAGE_SIZE };
        if (filters.visibility) params.visibility = filters.visibility;
        if (filters.status) params.status = filters.status;
        const response = await api.get("/api/notes/mine", { params });
        if (!active) return;
        setNotes(response.data.data);
        setPagination(response.data.pagination);
      } catch (loadError) {
        if (active) setError(getApiError(loadError));
      } finally {
        if (active) setLoading(false);
      }
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [filters.status, filters.visibility, pagination.page]);

  const visibleNotes = useMemo(() => {
    const term = filters.search.trim().toLowerCase();
    if (!term) return notes;
    return notes.filter((note) => [note.title, note.description, ...(note.categories || []).map((item) => item.name), ...(note.tags || []).map((item) => item.name)].some((value) => value?.toLowerCase().includes(term)));
  }, [filters.search, notes]);
  const totalPages = Math.max(1, Math.ceil(pagination.total / PAGE_SIZE));

  async function uploadFiles(noteId, files) {
    for (const file of files) {
      const data = new FormData();
      data.append("file", file);
      await api.post(`/api/notes/${noteId}/files`, data, { headers: { "Content-Type": "multipart/form-data" } });
    }
  }

  async function saveNote(payload, files) {
    let note;
    try {
      if (editingNote) {
        const response = await api.patch(`/api/notes/${editingNote.id}`, payload);
        note = response.data.data;
      } else {
        const response = await api.post("/api/notes", payload);
        note = response.data.data;
      }
      if (files.length) await uploadFiles(note.id, files);
      setEditingNote(null);
      setCreating(false);
      setNotice(editingNote?.status === "DRAFT" || !editingNote ? "Draft saved." : "Note updated.");
      await loadNotes();
      return { success: true };
    } catch (saveError) {
      if (note) {
        setNotice("The note was saved, but an attachment could not be uploaded. Edit the note to retry the upload.");
        await loadNotes().catch(() => {});
      }
      return { success: false, message: getApiError(saveError) };
    }
  }

  async function publishNote(note) {
    if (!window.confirm(`Publish “${note.title}”?`)) return;
    setBusyNoteId(note.id);
    setError("");
    try {
      await api.post(`/api/notes/${note.id}/publish`);
      setNotice("Note published.");
      await loadNotes();
    } catch (publishError) {
      setError(getApiError(publishError));
    } finally {
      setBusyNoteId(null);
    }
  }

  async function deleteNote(note) {
    if (!window.confirm(`Delete “${note.title}” and its attachments? This cannot be undone.`)) return;
    setBusyNoteId(note.id);
    setError("");
    try {
      await api.delete(`/api/notes/${note.id}`);
      setNotice("Note deleted.");
      await loadNotes();
    } catch (deleteError) {
      setError(getApiError(deleteError));
    } finally {
      setBusyNoteId(null);
    }
  }

  async function uploadSingle(note, file) {
    if (!/\.(pdf|docx?)$/i.test(file.name) || file.size > MAX_FILE_BYTES) {
      setError("Choose a PDF, DOC, or DOCX file up to 10 MB.");
      return;
    }
    setBusyNoteId(note.id);
    setError("");
    try {
      await uploadFiles(note.id, [file]);
      setNotice("Document attached.");
      await loadNotes();
    } catch (uploadError) {
      setError(getApiError(uploadError));
    } finally {
      setBusyNoteId(null);
    }
  }

  async function deleteFile(note, file) {
    if (!window.confirm(`Remove ${file.originalFilename}?`)) return;
    setBusyNoteId(note.id);
    setError("");
    try {
      await api.delete(`/api/notes/${note.id}/files/${file.id}`);
      setNotice("Attachment removed.");
      await loadNotes();
    } catch (fileError) {
      setError(getApiError(fileError));
    } finally {
      setBusyNoteId(null);
    }
  }

  async function openFile(note, file, forceDownload = false) {
    try {
      const response = await api.get(`/api/notes/${note.id}/files/${file.id}/download`, { responseType: "blob" });
      const objectUrl = URL.createObjectURL(response.data);
      if (!forceDownload && file.contentType === "application/pdf") {
        const viewer = document.createElement("a");
        viewer.href = objectUrl;
        viewer.target = "_blank";
        viewer.rel = "noopener noreferrer";
        viewer.setAttribute("aria-label", `View ${file.originalFilename}`);
        document.body.append(viewer);
        viewer.click();
        viewer.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
        return;
      }
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = file.originalFilename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (fileError) {
      setError(getApiError(fileError));
    }
  }

  function changeFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }));
    if (name !== "search") setPagination((current) => ({ ...current, page: 1 }));
  }

  function closeEditor() { setCreating(false); setEditingNote(null); }

  return (
    <div className="notes-page">
      <header className="notes-page-heading"><div><p className="notes-eyebrow">YOUR KNOWLEDGE SPACE</p><h1>My notes</h1><p>Keep ideas private, or publish notes you want to share.</p></div><div className="notes-page-actions"><button type="button" className="notes-secondary-button" onClick={() => loadNotes().catch((loadError) => setError(getApiError(loadError)))} disabled={loading}><RefreshCw size={16} /> Refresh</button><button type="button" className="notes-primary-button" onClick={() => { setEditingNote(null); setCreating((value) => !value); }}><Plus size={17} />{creating ? "Close editor" : "Create note"}</button></div></header>
      {error && <div className="notes-alert" role="alert"><span>{error}</span><button type="button" onClick={() => loadNotes().catch((loadError) => setError(getApiError(loadError)))}>Try again</button></div>}
      {notice && <div className="notes-notice" role="status">{notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss message"><X size={15} /></button></div>}
      {(creating || editingNote) && <NoteEditor key={editingNote?.id || "new-note"} note={editingNote} onSave={saveNote} onCancel={closeEditor} />}
      <section className="notes-toolbar" aria-label="Search and filter notes"><label className="notes-search"><Search size={17} /><input type="search" value={filters.search} onChange={(event) => changeFilter("search", event.target.value)} placeholder="Search loaded notes..." aria-label="Search loaded notes" /></label><label className="notes-filter">Visibility<select value={filters.visibility} onChange={(event) => changeFilter("visibility", event.target.value)}><option value="">All visibility</option><option value="PRIVATE">Private</option><option value="PUBLIC">Public</option></select></label><label className="notes-filter">Status<select value={filters.status} onChange={(event) => changeFilter("status", event.target.value)}><option value="">All statuses</option><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option><option value="RESTRICTED">Restricted</option></select></label></section>
      {loading ? <div className="notes-grid" aria-label="Loading notes">{Array.from({ length: 6 }, (_, index) => <div className="note-skeleton" key={index}><span /><span /><span /></div>)}</div> : visibleNotes.length === 0 ? <div className="notes-empty"><FileText size={34} /><h2>{notes.length || pagination.total ? "No notes match your search" : "Your notes start here"}</h2><p>{notes.length || pagination.total ? "Try another phrase or adjust the visibility and status filters." : "Create a note to capture an idea, keep a draft, or share something useful."}</p>{!notes.length && !pagination.total && <button className="notes-primary-button" type="button" onClick={() => setCreating(true)}><Plus size={16} /> Create your first note</button>}</div> : <><div className="notes-grid">{visibleNotes.map((note) => <NoteCard key={note.id} note={note} onEdit={(item) => { setCreating(false); setEditingNote(item); }} onDelete={deleteNote} onPublish={publishNote} onUpload={uploadSingle} onFileDelete={deleteFile} onFileOpen={openFile} busy={busyNoteId === note.id} />)}</div><footer className="notes-pagination"><span>Page {pagination.page} of {totalPages} · {pagination.total} notes</span><div><button type="button" className="notes-secondary-button" onClick={() => setPagination((current) => ({ ...current, page: current.page - 1 }))} disabled={pagination.page <= 1}>Previous</button><button type="button" className="notes-secondary-button" onClick={() => setPagination((current) => ({ ...current, page: current.page + 1 }))} disabled={pagination.page >= totalPages}>Next</button></div></footer></>}
    </div>
  );
}
