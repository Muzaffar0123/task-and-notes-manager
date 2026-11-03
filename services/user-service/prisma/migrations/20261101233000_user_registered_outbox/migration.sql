CREATE TABLE "UserEventOutbox" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "UserEventOutbox_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserEventOutbox_publishedAt_createdAt_idx"
    ON "UserEventOutbox"("publishedAt", "createdAt");