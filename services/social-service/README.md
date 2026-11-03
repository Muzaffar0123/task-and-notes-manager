# TaskFlow Social Service

Social Service owns `social_db`; it does not connect to `users_db` or `notes_db`. Apply its Prisma migration with `npx prisma migrate deploy` before startup.

## Service communication

`USER_SERVICE_URL` is used to validate follow targets through the minimal authenticated public-profile API. `NOTES_SERVICE_URL` is used to verify every feed item or interaction is still `PUBLIC` and `PUBLISHED`. RabbitMQ events maintain an ID-only eligibility/engagement projection; every returned candidate is revalidated against Notes Service.

All API routes require a valid TaskFlow JWT. Actor IDs come only from the verified JWT subject. `DATABASE_URL` must point to `social_db` only. RabbitMQ uses `RABBITMQ_URL` or the `RABBITMQ_HOST`, `RABBITMQ_PORT`, `RABBITMQ_USER`, and `RABBITMQ_PASSWORD` variables.

## API

- `GET /api/social/feed`, `GET /api/social/trending`
- `GET /api/social/profiles/:username` returns the safe public profile and aggregate public-note/follow statistics
- `GET /api/social/users/discover?search=&page=&pageSize=` searches safe active public profiles and returns the signed-in user's follow state and follower counts
- `GET /api/social/users/:userId/follow-status` checks the signed-in user's follow relationship
- `GET /api/social/creators/popular?page=&pageSize=` ranks public creators using received public-note likes and rating star points
- `GET /api/social/notes/discover?search=&category=&sortBy=&page=&pageSize=` proxies public-note discovery to Notes Service, strips file metadata, and only returns published public notes
- `POST /api/social/follows`, `DELETE /api/social/follows/:userId`
- `GET /api/social/follows/followers`, `GET /api/social/follows/following` (optional `userId`; list visibility is enforced against User Service settings)
- `GET`, `POST`, `DELETE /api/social/notes/:noteId/likes` proxy authoritative Notes Service engagement APIs
- `GET`, `POST /api/social/notes/:noteId/comments`
- `PATCH`, `DELETE /api/social/notes/:noteId/comments/:commentId`
- `GET`, `PUT /api/social/notes/:noteId/ratings` proxy authoritative Notes Service engagement APIs
- `POST`, `DELETE /api/social/notes/:noteId/bookmark`, `GET /api/social/bookmarks`
- `POST`, `GET /api/social/collections`; collection item and rename/delete routes are owner-scoped

Collections are private because every collection query is scoped to its JWT owner. The Notes event consumer removes restricted, private, or deleted notes from the local eligible-note projection and prunes their interactions after deletion.

User discovery data is fetched from User Service; follow state and follower counts are read from Social Service's existing `Follow` model. Like and rating writes and aggregates are owned by Notes Service. Social Service consumes their outbox events and stores idempotent public-only engagement totals for profiles and creator rankings; creator score is likes plus total rating stars. Hiding or deleting a note removes it from the public projection. Followed-user notes remain available through the existing `/api/social/feed`.

For upgrades from the previous Social-owned engagement tables, the internal token-protected `/internal/social/engagement/export` route supports the Notes Service's one-time import script. It is not part of the public API.