CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'DEACTIVATED', 'FROZEN');

ALTER TABLE "User"
ADD COLUMN "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE';

CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminAuditLog_adminId_createdAt_idx"
    ON "AdminAuditLog"("adminId", "createdAt");
CREATE INDEX "AdminAuditLog_targetUserId_createdAt_idx"
    ON "AdminAuditLog"("targetUserId", "createdAt");
