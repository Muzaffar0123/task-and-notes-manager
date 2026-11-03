async function refreshEligibleNoteStats(transaction, noteId) {
  const commentCount = await transaction.comment.count({ where: { noteId, deletedAt: null } });

  await transaction.eligibleNote.updateMany({
    where: { noteId },
    data: { commentCount },
  });
}

module.exports = { refreshEligibleNoteStats };