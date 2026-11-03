ALTER TABLE "EligibleNote"
ADD COLUMN "ratingTotal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "popularityScore" INTEGER NOT NULL DEFAULT 0;

UPDATE "EligibleNote"
SET
    "ratingTotal" = ROUND("ratingAverage" * "ratingCount")::INTEGER,
    "popularityScore" = "likeCount" + ROUND("ratingAverage" * "ratingCount")::INTEGER;

CREATE INDEX "EligibleNote_ownerId_popularityScore_idx"
ON "EligibleNote"("ownerId", "popularityScore");
