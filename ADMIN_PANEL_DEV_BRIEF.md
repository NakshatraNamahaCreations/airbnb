# Brief for the Admin Panel Developer

Hi — the Stay Finder backend has been restructured to support the admin panel. Everything below is live on the API server. Two reference docs to keep open:

- [`documentation.md`](documentation.md) — project overview, models, auth, full REST surface.
- [`backend_data.md`](backend_data.md) — endpoint-by-endpoint contract (path, headers, body, response, audit action). This is your primary reference.

Below is a tight summary of what changed and what you need to know.

---

## 1. Auth — start here

- **No admin signup endpoint.** The first super-admin is seeded via `scripts/seedSuperAdmin.js`. Subsequent admins are created by a super-admin through `POST /admin/admins`.
- **Login:** `POST /api/v1/admin/login` with `{ email, password }`. Returns `{ data: { token, admin } }` and also sets a `jwt` httpOnly cookie. Use the token as `Authorization: Bearer <token>` on every subsequent call.
- **Logout:** `POST /api/v1/admin/logout` clears the cookie.
- **Self:** `GET /admin/me`, `PATCH /admin/me` (update name/phone/password).
- **JWT lifetime:** 30 days.

### Admin roles
Three roles exist on the `Admin` model: `super_admin`, `admin`, `support`. Endpoints note which role is required. Examples:
- `super_admin only` — admin CRUD (`/admin/admins*`), audit log read.
- `super_admin/admin` — every mutating action (suspend user, approve listing, cancel booking, refund, etc.).
- `admin` (any of the three) — most read endpoints.

The token already carries the role; on 403 you'll see `{ code: 'forbidden', message: 'Requires one of: ...' }`. Don't try to parse the JWT yourself — the server enforces it.

---

## 2. Conventions you need to know

### Pagination (every list endpoint)
Query: `?page=1&limit=20&sort=-createdAt&q=foo`
- `page` default `1`. `limit` default `20`, clamped to `[1, 100]`.
- `sort` is comma-separated. Prefix `-` for desc. Default `-createdAt`.
- `q` is free-text — each endpoint decides which fields it matches.
- Response always includes:
  ```json
  { "data": [...], "pagination": { "total": 0, "page": 1, "limit": 20, "pages": 0 } }
  ```

### Filtering
List endpoints take resource-specific filters. Common ones:
- Users: `role=guest|host|admin`, `status=active|suspended|deleted`, `kycStatus=verified|...`
- Listings: `status=...`, `hostId=`, `city=`, `state=`, `minPrice=`, `maxPrice=`
- Bookings: `status=`, `listingId=`, `guestId=`, `from=`, `to=`
- Payments: `status=`, `userId=`, `bookingId=`, `from=`, `to=`
- Feedbacks: `listingId=`, `userId=`, `minRating=`, `maxRating=`, `hasReview=true|false`

Full filter list per endpoint is in `backend_data.md`.

### Error shape
Global handler returns:
```json
{ "code": "...", "message": "...", "stack": "..." }
```
HTTP status codes are meaningful: `400` invalid id / wrong state, `401` no/invalid token, `403` forbidden role / suspended account, `404` not found, `409` duplicate, `422` validation, `500` server error.

### CORS
In dev, any `http://localhost:<port>` is allowed. For prod, set `FRONTEND_URLS=https://admin.yourdomain.com` on the API server's `.env`. Credentials are enabled, so if you use cookies, `axios` needs `withCredentials: true`.

---

## 3. Domain shape & enum values

These enums matter for the UI:

- **`User.status`** — `active | suspended | deleted` (deleted = soft).
- **`User.roles`** — array of `guest | host | admin`. A user can have multiple.
- **`Admin.role`** — `super_admin | admin | support` (single value).
- **`Admin.status`** — `active | suspended`.
- **`Listing.status`** — `active | paused | draft | pending_review | approved | rejected`.
- **`Booking.status`** — `pending | accepted | rejected | cancelled_by_guest | cancelled_by_admin | completed | no_show`.
- **`Payment.status`** — `created | captured | failed | refunded | partially_refunded`.
- **`meonKyc.status`** — `not_started | token_generated | link_generated | permission_granted | data_fetched | verified | failed`.

Hardcode dropdowns from these.

---

## 4. Host management — important workflow

Hosts are `User` records with `host` in their `roles` array. Admin owns the entire host lifecycle:

### Create a brand-new host
`POST /api/v1/admin/hosts`
```json
{ "phone": "9876543210", "name": "Ramesh K", "email": "ramesh@example.com", "dateOfBirth": "1985-04-12" }
```
- Phone normalised (strip non-digits, strip leading `91`, validate `^[6-9]\d{9}$`).
- Email lower-cased and pattern-checked.
- On `409` the body includes `existingUserId` — switch to `POST /admin/users/:existingUserId/upgrade-to-host`.

### Edit an existing host
`PATCH /api/v1/admin/hosts/:id`
```json
{ "name": "...", "email": "...", "phone": "...", "dateOfBirth": "..." }
```
Any subset. Same validation as create. `409` if phone/email clashes with another user. `400` if the target user doesn't have the `host` role (in that case use `PATCH /admin/users/:id`).

### Upgrade / downgrade existing user
- `POST /admin/users/:id/upgrade-to-host` — add `host` role.
- `POST /admin/users/:id/downgrade-from-host` — remove `host` role.

### List hosts
`GET /admin/users?role=host&page=1&limit=20`.

### Create a listing for a host
`POST /api/v1/listings` (note: `/listings`, not `/admin/listings`)
```json
{ "hostId": "<User _id with host role>", "title": "...", "address": "...", "city": "...", "state": "Karnataka", "pincode": "...", "pricePerNight": 2500, "bedrooms": 1, "maxGuests": 4, "maxInfants": 1, "maxPets": 0, ... }
```
**Capacity (important — changed):** there are no per-category caps. `maxGuests` is the single shared cap on `adults + children`. `maxInfants` and `maxPets` are separate (infants/pets don't count toward `maxGuests`; `maxPets: 0` = no pets). The admin form's "Adults / Children" inputs should be removed — only collect `maxGuests`, `maxInfants`, `maxPets`. A booking is validated as: ≥1 adult, `adults + children ≤ maxGuests`, `infants ≤ maxInfants`, `pets ≤ maxPets`.

Hosts do NOT have a self-serve listing flow. Admin creates everything on their behalf. `createdByAdminId` is recorded automatically.

---

## 5. Moderation workflows

### Listings
1. `GET /admin/listings?status=pending_review` — moderation queue.
2. `POST /admin/listings/:id/approve` — sets `approved`.
3. `POST /admin/listings/:id/reject` with `{ "reason": "..." }` — sets `rejected` + `rejectionReason`.
4. `POST /admin/listings/:id/pause` and `/activate` — toggle between `paused` and `active`.

### Bookings
- `GET /admin/bookings` — global view (your own user-app should use `/bookings` which is auto-scoped to the logged-in user; admin uses `/admin/bookings`).
- `POST /admin/bookings/:id/cancel` with `{ "reason": "..." }` — sets `cancelled_by_admin`. Admin accept/reject is not exposed yet (let me know if you need it).

### Payments
- `GET /admin/payments` — list / filter.
- `POST /admin/payments/:id/refund` with `{ "amount": ..., "reason": "..." }` — appends to `refunds[]`. **Note:** this records the refund on our side but does not call the Razorpay refund API yet. UI should flag "manual reconciliation required" until that's wired.

### Feedbacks (reviews)
- `GET /admin/feedbacks` — global list with `listingId`, `userId`, rating range, `hasReview` filters.
- `DELETE /admin/feedbacks/:id` — hard delete. No soft-hide flag yet.

### KYC
- `GET /admin/kyc?status=...` — list users with KYC status filter.
- `GET /admin/kyc/:id` — full `meonKyc` subdoc.
- `POST /admin/kyc/:id/override` with `{ "status": "verified" | "failed", "reason": "..." }` — manual override.

---

## 6. Dashboard

`GET /admin/dashboard/overview` returns one bundle of counts (users / admins / listings / bookings / revenue / reviews). Use it for the landing screen. There's no trends endpoint yet, so charts are limited to whatever you can derive client-side.

---

## 7. Audit log

Every mutating admin endpoint writes an `AuditLog` entry: `{ actorAdminId, actorEmail, action, target: { model, id }, payload, ip, userAgent, createdAt }`.

Read at `GET /admin/audit-logs` (super_admin/admin) with filters `actorAdminId=`, `action=`, `targetModel=`, `from=`, `to=`.

Action names follow `<resource>.<verb>` — e.g. `user.suspend`, `listing.approve`, `booking.cancel`, `payment.refund`, `host.create`, `host.update`, `kyc.override`. Full list in `backend_data.md` §12.

---

## 8. Image upload (admin)

`POST /api/v1/uploads/presign` with:
```json
{ "filesMeta": [ { "fileName": "house-front.jpg", "contentType": "image/jpeg" } ] }
```
Response gives `{ ok: true, uploads: [ { url, key, publicUrl } ] }`. Frontend PUTs the file bytes directly to `url`. Once successful, store `publicUrl` in the listing's `imageUrls[]`.

---

## 9. What's deferred / known gaps (treat as future tickets)

- No `GET /admin/dashboard/trends` (only overview counts).
- No admin accept/reject for bookings (handlers exist; just not mounted).
- No `PATCH/DELETE /admin/featured-areas/:id` (only POST/GET).
- No `Feedback.isHidden` flag (admin can only hard-delete).
- Razorpay refund API is **not** called from `/admin/payments/:id/refund` — payment record is updated locally only.
- No host self-serve endpoints.
- Pre-existing listings (if any) may have `hostId` pointing to `Admin` (old schema). Backend may need to wipe/migrate before go-live.

---

## 10. Quick test checklist before you build screens

```
POST /api/v1/admin/login        → get token
GET  /api/v1/admin/me            → confirm role
GET  /api/v1/admin/dashboard/overview
GET  /api/v1/admin/users?page=1&limit=5
POST /api/v1/admin/hosts         → create a host (validation, 409, 422)
PATCH /api/v1/admin/hosts/:id    → edit a host
POST /api/v1/listings            → with hostId from previous step
GET  /api/v1/admin/listings
POST /api/v1/admin/listings/:id/approve
GET  /api/v1/admin/audit-logs    → confirm entries appear
```

If anything 401s when it shouldn't, paste the request (URL, method, headers) and we'll fix the auth gate.

— Backend team
