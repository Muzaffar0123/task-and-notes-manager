# TaskFlow User Service

User Service owns account identity and public profile preferences. Its database remains separate from Social Service and Notes Service. Apply schema changes with `npx prisma migrate deploy`; profile/privacy changes are additive and preserve existing user rows.

## Profile and privacy APIs

All endpoints are available through the API Gateway at `/api/users` and require a valid TaskFlow JWT except registration and login.

- `GET /:userId/public-profile` and `GET /public-profile/username/:username` return only the public identity fields, join date, profile-image availability, and list visibility settings.
- `GET /discover?search=&page=&pageSize=` searches active public identities by username or display name; results never include email, role, or credentials.
- `GET /:userId/public-profile/image` streams the profile image without exposing its storage key or metadata.
- `PUT /profile` updates the signed-in user's name/email and optional username/bio.
- `GET /profile/privacy` and `PUT /profile/privacy` read or update the signed-in user's follower/following list visibility (`EVERYONE`, `FOLLOWERS_ONLY`, or `ONLY_ME`).

Privacy updates are owner-scoped to the authenticated JWT subject. Social Service applies those settings to connection-list requests while profile counts remain visible.
