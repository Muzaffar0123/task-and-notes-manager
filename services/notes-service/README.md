# TaskFlow Notes Service

The service owns `notes_db` and never connects to `users_db` or `social_db`. Apply its Prisma migration with `npx prisma migrate deploy` before starting it.

## Configuration

Required: `DATABASE_URL`, `JWT_SECRET`. Admin access is granted only by a verified JWT `role: "ADMIN"` claim or the configured `ADMIN_USER_IDS` allowlist. The current User Service does not issue role claims yet, so configure the allowlist until that integration is added.

RabbitMQ uses `RABBITMQ_URL` or `RABBITMQ_HOST`, `RABBITMQ_PORT`, `RABBITMQ_USER`, and `RABBITMQ_PASSWORD`. Notes events are written to the outbox in the same transaction as public note changes and delivered to the durable `taskflow.events` topic exchange.
Likes and ratings are owned by this service and have their own transactional outbox events; engagement is restricted to public published notes.

Document uploads accept PDF, DOC, and DOCX, and validate file extensions against their binary formats. `MAX_UPLOAD_BYTES` defaults to 10 MiB and can be configured. File metadata is stored in `notes_db`; S3 objects use generated keys and are private. Downloads are streamed only after API authorization, with no permanent URL returned for private files.

For local development, the root Compose file runs a persistent, single-node SeaweedFS S3 endpoint on loopback port 9000. The endpoint, bucket, and credentials come from the ignored root `.env`; `.env.example` contains placeholders only. User Service profile images use the same S3 bucket and endpoint, with their metadata stored in `users_db` and a separate configurable 5 MiB default limit (`PROFILE_IMAGE_MAX_BYTES`). Use the authenticated `/api/users/profile/image` upload, read, and delete routes; the profile image key is never returned to clients.

The root `.env.example` lists the new configuration keys. Do not put real credentials in that template.

## API

- `POST /api/notes`, `GET /api/notes/mine`, `GET /api/notes/search`
- `GET`, `PATCH`, `DELETE /api/notes/:id`
- `POST /api/notes/:id/publish`, `GET /api/notes/:id/statistics`
- `POST /api/notes/:noteId/files`, `GET /api/notes/:noteId/files/:fileId/download`
- `POST /api/notes/:noteId/reports`
- `GET`, `POST`, `DELETE /api/notes/:id/likes`
- `GET`, `PUT /api/notes/:id/ratings`
- `GET /api/notes/:id/engagement`
- Admin: `GET /api/notes/admin/public`, `GET /api/notes/admin/reports`, report review, and public-note restrict/restore routes

All routes require a valid TaskFlow JWT. Public search/feed queries always filter to `PUBLIC` and `PUBLISHED`. Admin queries always filter to `PUBLIC`; no admin route loads private note rows.

When upgrading an installation that already stored likes or ratings in Social Service, apply both services' additive Prisma migrations and run `node scripts/importLegacyEngagement.js` once from this service. The import uses Social Service's internal token-protected REST export, imports only currently public/published notes, skips self-engagement and invalid legacy ratings, and is safe to rerun. It never connects directly to `social_db`.
