# TaskFlow Notification Service

Notification Service owns `notifications_db`. Its migration is additive: existing notifications are retained and assigned the `SYSTEM` category; the legacy table is created only when absent on a fresh database.

## API

All notification APIs require a TaskFlow JWT and scope reads/updates/deletes to the authenticated user.

- `POST /api/notifications` keeps the legacy create contract; an optional `userId` must match the JWT subject.
- `GET /api/notifications?page=1&pageSize=50&isRead=false&category=TASK`
- `GET /api/notifications/:id`, `PATCH /api/notifications/:id/read`, `DELETE /api/notifications/:id`
- `PATCH /api/notifications/read-all`, `GET /api/notifications/unread-count`
- `GET /api/notifications/preferences`, `PUT /api/notifications/preferences`
- `GET /api/notifications/announcements`

Preference defaults enable in-app notifications and disable activity email. `UserRegistered` is an account notification and is not suppressed by optional activity preferences.

## Events

The service consumes the durable `taskflow.events` topic exchange. It binds User, Task, Notes, Social, and announcement routing keys. Main events are processed once using `ProcessedEvent`; notification rows are uniquely keyed by user and source event. Temporary failures pass through a delayed retry queue and then to a durable dead-letter queue after `NOTIFICATION_MAX_RETRIES`.

For `NotePublished`, the event can provide `recipientIds`; otherwise the service asks Social Service for follower IDs using `SOCIAL_SERVICE_URL` and `INTERNAL_SERVICE_TOKEN`. This endpoint returns IDs only. The consumer uses generic messages and safe IDs, never note text, private content, or document URLs.
New `note.liked` and `note.rated` events create deduplicated in-app notifications for the public note owner. Rating updates and unlikes do not generate additional notifications.

Announcement events should include `recipientIds` when targeted delivery is required. Announcement titles/messages are stripped of URLs before persistence and notification.

## Email

The provider adapter uses `EMAIL_PROVIDER_URL`, `EMAIL_PROVIDER_API_KEY`, and `EMAIL_FROM` with a Resend-compatible JSON API and an `Idempotency-Key` header. Missing provider configuration skips email without blocking in-app delivery. Provider errors leave the event retryable; email requests use a stable event/recipient idempotency key.

`INTERNAL_SERVICE_TOKEN` must be a long random value shared with Social Service. Do not put real credentials in `.env.example`.