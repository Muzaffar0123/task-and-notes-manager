-- FollowCreated events are not tied to a note, so noteId must be nullable.
ALTER TABLE "SocialEventOutbox"
ALTER COLUMN "noteId" DROP NOT NULL;
