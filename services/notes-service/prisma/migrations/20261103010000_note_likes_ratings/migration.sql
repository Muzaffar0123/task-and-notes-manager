CREATE TABLE "NoteLike" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NoteLike_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NoteRating" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NoteRating_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NoteLike_noteId_userId_key" ON "NoteLike"("noteId", "userId");
CREATE INDEX "NoteLike_noteId_createdAt_idx" ON "NoteLike"("noteId", "createdAt");
CREATE UNIQUE INDEX "NoteRating_noteId_userId_key" ON "NoteRating"("noteId", "userId");
CREATE INDEX "NoteRating_noteId_value_idx" ON "NoteRating"("noteId", "value");
ALTER TABLE "NoteRating"
ADD CONSTRAINT "NoteRating_value_range_check" CHECK ("value" BETWEEN 1 AND 5);

ALTER TABLE "NoteLike" ADD CONSTRAINT "NoteLike_noteId_fkey"
FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NoteRating" ADD CONSTRAINT "NoteRating_noteId_fkey"
FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;
