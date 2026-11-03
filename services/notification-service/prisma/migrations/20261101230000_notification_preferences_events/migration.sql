DO $$ BEGIN
    CREATE TYPE "NotificationCategory" AS ENUM (
        'TASK', 'FOLLOW', 'NOTE', 'LIKE', 'COMMENT', 'RATING', 'ANNOUNCEMENT', 'SYSTEM'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "ProcessedEventStatus" AS ENUM ('PROCESSING', 'RETRY', 'PROCESSED', 'DEAD_LETTERED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT FALSE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Notification_userId_isRead_idx"
    ON "Notification"("userId", "isRead");
CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx"
    ON "Notification"("createdAt");

ALTER TABLE "Notification"
    ADD COLUMN IF NOT EXISTS "category" "NotificationCategory" NOT NULL DEFAULT 'SYSTEM',
    ADD COLUMN IF NOT EXISTS "sourceEventId" TEXT,
    ADD COLUMN IF NOT EXISTS "metadata" JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS "Notification_userId_sourceEventId_key"
    ON "Notification"("userId", "sourceEventId");
CREATE INDEX IF NOT EXISTS "Notification_userId_category_createdAt_idx"
    ON "Notification"("userId", "category", "createdAt");

CREATE TABLE IF NOT EXISTS "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationPreference_userId_category_key"
    ON "NotificationPreference"("userId", "category");
CREATE INDEX IF NOT EXISTS "NotificationPreference_userId_idx"
    ON "NotificationPreference"("userId");

CREATE TABLE IF NOT EXISTS "Announcement" (
    "id" TEXT NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Announcement_sourceEventId_key"
    ON "Announcement"("sourceEventId");
CREATE INDEX IF NOT EXISTS "Announcement_publishedAt_idx"
    ON "Announcement"("publishedAt");

CREATE TABLE IF NOT EXISTS "ProcessedEvent" (
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" "ProcessedEventStatus" NOT NULL DEFAULT 'PROCESSING',
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "processingUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProcessedEvent_pkey" PRIMARY KEY ("eventId")
);
CREATE INDEX IF NOT EXISTS "ProcessedEvent_status_updatedAt_idx"
    ON "ProcessedEvent"("status", "updatedAt");