CREATE TYPE "ProfileListVisibility" AS ENUM ('EVERYONE', 'FOLLOWERS_ONLY', 'ONLY_ME');

ALTER TABLE "User"
ADD COLUMN "username" TEXT,
ADD COLUMN "bio" VARCHAR(500) NOT NULL DEFAULT '',
ADD COLUMN "followersVisibility" "ProfileListVisibility" NOT NULL DEFAULT 'EVERYONE',
ADD COLUMN "followingVisibility" "ProfileListVisibility" NOT NULL DEFAULT 'EVERYONE';

WITH numbered_users AS (
    SELECT "id", ROW_NUMBER() OVER (ORDER BY "id") AS row_num
    FROM "User"
)
UPDATE "User" AS existing_user
SET "username" = 'member_' || numbered_users.row_num::TEXT
FROM numbered_users
WHERE existing_user."id" = numbered_users."id";

ALTER TABLE "User"
ALTER COLUMN "username" SET NOT NULL;

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
