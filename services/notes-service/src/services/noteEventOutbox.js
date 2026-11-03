function safeNoteEventPayload(note) {
  return {
    noteId: note.id,
    ownerId: note.ownerId,
    visibility: note.visibility,
    status: note.status,
    publishedAt: note.publishedAt,
  };
}

async function enqueueNoteEvent(transaction, eventType, note) {
  const payload = safeNoteEventPayload(note);
  const includeEngagement = [
    "NotePublished",
    "NoteUpdated",
    "NoteRestricted",
    "NoteRestored",
  ].includes(eventType) || (
    eventType === "NoteVisibilityChanged" &&
    note.visibility === "PUBLIC" &&
    note.status === "PUBLISHED"
  );
  if (includeEngagement) {
    const [likeCount, ratings] = await Promise.all([
      transaction.noteLike.count({ where: { noteId: note.id } }),
      transaction.noteRating.aggregate({
        where: { noteId: note.id },
        _avg: { value: true },
        _sum: { value: true },
        _count: { _all: true },
      }),
    ]);
    Object.assign(payload, {
      likeCount,
      ratingCount: ratings._count._all,
      ratingAverage: ratings._avg.value || 0,
      ratingTotal: ratings._sum.value || 0,
    });
  }
  await transaction.noteEventOutbox.create({
    data: {
      eventType,
      noteId: note.id,
      ownerId: note.ownerId,
      payload: JSON.parse(JSON.stringify(payload)),
    },
  });
}

module.exports = { enqueueNoteEvent, safeNoteEventPayload };