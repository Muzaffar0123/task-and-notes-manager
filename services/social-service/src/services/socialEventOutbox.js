async function enqueueSocialEvent(transaction, eventType, noteId, actorId, payload) {
  await transaction.socialEventOutbox.create({
    data: {
      eventType,
      noteId,
      actorId,
      payload: JSON.parse(JSON.stringify(payload)),
    },
  });
}

module.exports = { enqueueSocialEvent };