# Admin Panel — Backend API Contract

Full request/response contract for every admin endpoint. All endpoints are **implemented and live** unless explicitly marked.

For context (data model, auth, end-user routes) see [documentation.md](documentation.md).

## Conventions

- **Base URL:** `http://localhost:9000/api/v1` (dev) / `https://api.stayfinderindia.net/api/v1` (prod).
- **Auth header:** `Authorization: Bearer <ADMIN_JWT>` on every admin call. Login also sets a `jwt` httpOnly cookie (sameSite=strict, 30d) — the middleware accepts either.
- **Content type:** `application/json` (unless noted).
- **Pagination query:** `?page=&limit=&sort=&q=` on every list endpoint.
  - `page` default `1` (min 1).
  - `limit` default `20`, clamped `[1, 100]`.
  - `sort` comma-separated, prefix `-` for desc. Default `-createdAt`.
  - `q` free-text search; each endpoint decides which fields match.
- **List response envelope:**
  ```json
  {
    "data": [ ... ],
    "pagination": { "total": 0, "page": 1, "limit": 20, "pages": 0 }
  }
  ```
- **Error envelope** (global handler): `{ "code": "...", "message": "...", "stack": "..." }` (`stack` only in development).
- **Admin role gating:** endpoints noted as `super_admin` require the caller to have `role: 'super_admin'`. `super_admin/admin` accepts either.

---

## 0. Bootstrapping the first admin

There is **no signup endpoint**. Seed the first admin once:

```powershell
$env:SEED_ADMIN_EMAIL='admin@stayfinder.com'
$env:SEED_ADMIN_PASSWORD='SomeStrongPass!'
$env:SEED_ADMIN_ROLE='super_admin'    # optional, defaults to super_admin
node scripts/seedSuperAdmin.js
```

Idempotent. Subsequent admins are created via `POST /admin/admins` (super_admin only).

---

## 1. Admin Auth & Self

### 1.1 POST `/admin/login`
**Auth:** none. **Body:**
```json
{ "email": "admin@example.com", "password": "Secret@123" }
```
**Response 200:**
```json
{
  "message": "login successful",
  "data": {
    "token": "<JWT>",
    "admin": {
      "_id": "...", "email": "...", "name": "...", "phone": "...",
      "role": "super_admin", "status": "active",
      "lastLoginAt": "...", "createdAt": "...", "updatedAt": "..."
    }
  }
}
```
Also sets `Set-Cookie: jwt=<JWT>` (httpOnly).
**Errors:** `401` invalid credentials, `403` admin account suspended.

### 1.2 POST `/admin/logout`
**Auth:** admin. **Body:** —
**Response 200:** `{ "message": "logged out" }`. Clears the `jwt` cookie.

### 1.3 GET `/admin/me`
**Auth:** admin.
**Response 200:**
```json
{ "message": "admin profile fetched successfully", "data": { ...admin minus password } }
```

### 1.4 PATCH `/admin/me`
**Auth:** admin. **Body (any subset):** `{ "name": "...", "phone": "...", "password": "..." }`
**Response 200:** `{ "message": "updated", "data": <admin> }`. Audit: `admin.self.update`.

---

## 2. Admin Management (super_admin only)

### 2.1 GET `/admin/admins`
**Auth:** super_admin.
**Query:** `?page&limit&sort&q&role=super_admin|admin|support&status=active|suspended`
**Response 200:**
```json
{
  "data": [ { "_id":"...","email":"...","name":"...","phone":"...","role":"admin","status":"active","createdAt":"...","updatedAt":"..." } ],
  "pagination": { "total":0,"page":1,"limit":20,"pages":0 }
}
```

### 2.2 POST `/admin/admins`
**Auth:** super_admin.
**Body:**
```json
{ "email": "x@y.com", "password": "Strong!1", "name": "X Y", "phone": "+91...", "role": "admin" }
```
`role` ∈ `super_admin | admin | support` (default `admin`).
**Response 201:** `{ "message": "admin created", "data": <admin minus password> }`. Audit: `admin.create`.
**Errors:** `422` missing fields/invalid role, `409` email already exists.

### 2.3 PATCH `/admin/admins/:id`
**Auth:** super_admin.
**Body (any subset):** `{ "name", "phone", "role", "password", "status" }`
**Response 200:** `{ "message": "updated", "data": <admin> }`. Audit: `admin.update`.

### 2.4 DELETE `/admin/admins/:id`
**Auth:** super_admin.
**Response 200:** `{ "message": "deleted" }`. Audit: `admin.delete`.
**Errors:** `400` cannot delete yourself.

---

## 3. Dashboard

### 3.1 GET `/admin/dashboard/overview`
**Auth:** admin.
**Response 200:**
```json
{
  "data": {
    "users":    { "total": 0, "newThisMonth": 0 },
    "admins":   { "total": 0 },
    "listings": { "total": 0, "active": 0, "pendingReview": 0, "rejected": 0 },
    "bookings": { "total": 0, "pending": 0, "accepted": 0, "rejected": 0, "today": 0 },
    "revenue":  { "totalInr": 0, "monthInr": 0, "todayInr": 0 },
    "reviews":  { "total": 0, "avgRating": 0 }
  }
}
```
Revenue is computed as `sum(amount - refundedAmount)` over payments with status `captured` or `partially_refunded`.

### 3.2 GET `/admin/dashboard/trends` — **NOT IMPLEMENTED YET**
Reserved for time-series charts. See documentation.md §8.

---

## 4. Users

### 4.1 GET `/admin/users`
**Auth:** admin.
**Query:** `?page&limit&sort&q&role=guest|host|admin&status=active|suspended|deleted&kycStatus=verified|not_started|...`
Search `q` matches `name`, `email`, `phone` (case-insensitive).
**Response 200:**
```json
{
  "message": "Users fetched successfully",
  "data": [ <user doc> ],
  "pagination": { ... }
}
```

### 4.2 GET `/admin/users/:id`
**Auth:** admin.
**Response 200:**
```json
{
  "data": {
    "user":  { ...full user doc },
    "stats": { "bookings": 0, "listingsOwned": 0, "reviews": 0 }
  }
}
```

### 4.3 PATCH `/admin/users/:id`
**Auth:** super_admin/admin.
**Body (any subset):** `{ "name", "email", "dateOfBirth", "status", "roles", "suspensionReason" }`
Allowed `status` values: `active`, `suspended`, `deleted`. Setting `status: suspended` auto-sets `suspendedAt`.
**Response 200:** `{ "message": "updated", "data": <user> }`. Audit: `user.update`.

### 4.4 POST `/admin/users/:id/suspend`
**Auth:** super_admin/admin.
**Body:** `{ "reason": "spam" }` (optional)
**Response 200:** `{ "message": "user suspended", "data": <user> }`. Audit: `user.suspend`.

### 4.5 POST `/admin/users/:id/activate`
**Auth:** super_admin/admin. **Body:** —
**Response 200:** `{ "message": "user activated", "data": <user> }`. Audit: `user.activate`.

### 4.6 DELETE `/admin/users/:id`
**Auth:** super_admin/admin. Soft delete — sets `status: deleted`. **Body:** —
**Response 200:** `{ "message": "user deleted (soft)", "data": <user> }`. Audit: `user.delete`.

### 4.7 POST `/admin/hosts`
**Auth:** super_admin/admin. Creates a brand-new User with `roles: ['guest','host']` directly (no OTP, no user self-signup). The host does not log in themselves — admin manages everything on their behalf.
**Body:**
```json
{
  "phone": "9876543210",
  "name": "Ramesh K",
  "email": "ramesh@example.com",
  "dateOfBirth": "1985-04-12"
}
```
All four fields required. Phone is normalised (non-digits stripped, leading `91` removed, must match `^[6-9]\d{9}$`). Email lower-cased and pattern-validated. `dateOfBirth` must parse to a valid Date.
**Response 201:** `{ "message": "host created", "data": <user with roles ['guest','host']> }`. Audit: `host.create`.
**Errors:**
- `422` missing or invalid field.
- `409` phone or email already exists — response includes `{ data: { existingUserId } }`. Use `/admin/users/:id/upgrade-to-host` on the existing user instead.

### 4.8 PATCH `/admin/hosts/:id`
**Auth:** super_admin/admin. Edit an existing host's profile. Fails with `400` if the target user is not a host (use `PATCH /admin/users/:id` for non-hosts).
**Body (any subset):** `{ "name", "email", "phone", "dateOfBirth" }`
Same normalisation/validation rules as `POST /admin/hosts`. `phone` and `email` are checked for uniqueness against other users.
**Response 200:** `{ "message": "host updated", "data": <user> }`. Audit: `host.update`.
**Errors:** `400` not a host, `404` host not found, `409` phone/email already used, `422` invalid field.

### 4.9 POST `/admin/users/:id/upgrade-to-host`
**Auth:** super_admin/admin. Adds `host` to `roles`. **Body:** —
**Response 200:** `{ "message": "user became host successfully", "data": <user> }`. Audit: `user.upgrade_to_host`.

### 4.10 POST `/admin/users/:id/downgrade-from-host`
**Auth:** super_admin/admin. Removes `host` from `roles`. **Body:** —
**Response 200:** `{ "message": "host role removed", "data": <user> }`. Audit: `user.downgrade_from_host`.

### 4.11 GET `/admin/users/:id/bookings`
**Auth:** admin.
**Query:** `?page&limit&sort&status=`
**Response 200:**
```json
{
  "data": [ { ...booking, "listingId": { "_id":"...","title":"...","imageUrls":[...] } } ],
  "pagination": { ... }
}
```

---

## 5. Listings

> **Create / Update / Delete** still live at the existing `/listings` endpoints (admin-gated), not under `/admin/listings`.

### 5.1 GET `/admin/listings`
**Auth:** admin.
**Query:** `?page&limit&sort&q&status=active|paused|draft|pending_review|approved|rejected&hostId=&city=&state=&minPrice=&maxPrice=`
**Response 200:**
```json
{
  "data": [ { ...listing, "hostId": { "_id":"...","name":"...","email":"...","phone":"..." } } ],
  "pagination": { ... }
}
```

### 5.2 GET `/admin/listings/:id`
**Auth:** admin.
**Response 200:**
```json
{
  "data": {
    "listing": { ...listing with hostId populated },
    "stats":   { "bookings": 0, "avgRating": 0, "totalReviews": 0 }
  }
}
```

### 5.3 POST `/listings` (existing endpoint, admin-gated)
**Auth:** admin.
**Body:**
```json
{
  "hostId": "<User _id, must have host role>",
  "title": "Cozy Studio",
  "description": "...",
  "imageUrls": ["https://..."],
  "address": "...",
  "city": "Bangalore",
  "state": "Karnataka",
  "pincode": "560001",
  "pricePerNight": 2500,
  "currency": "INR",
  "bedrooms": 1,
  "maxGuests": 4,
  "maxInfants": 1,
  "maxPets": 0,
  "amenities": ["WiFi","Kitchen"],
  "location": { "type":"Point", "coordinates": [77.5946, 12.9716] },
  "houseRules": [],
  "safetyAndProperty": [],
  "status": "active"
}
```
**Capacity model (changed):** there are no per-category caps anymore. Use:
- `maxGuests` (required, min 1) — shared cap on `adults + children`.
- `maxInfants` (default 0) — infants don't count toward `maxGuests`.
- `maxPets` (default 0) — pets don't count toward `maxGuests`; `0` = not allowed.

`createdByAdminId` is set automatically from the admin token.
**Response 201:** `{ "message": "Listing created successfully", "listing": <doc> }`.
**Errors:** `422` missing/invalid `hostId` or `maxGuests < 1`, `400` host user is not active or lacks `host` role, `404` host user not found.

### 5.4 PATCH `/listings/:id` (existing, admin)
Allowed fields: `title`, `description`, `imageUrls`, `address`, `city`, `state`, `pincode`, `amenities`, `location`, `pricePerNight`, `currency`, `bedrooms`, `maxGuests`, `maxInfants`, `maxPets`, `houseRules`, `safetyAndProperty`, `status`. (`capacity` is gone — replaced by `maxGuests` / `maxInfants` / `maxPets`.)

### 5.5 DELETE `/listings/:id` (existing, admin)

### 5.6 POST `/admin/listings/:id/approve`
**Auth:** super_admin/admin. **Body:** —
Sets `status: approved`, `approvedAt: now`, `approvedByAdminId: req.adminId`. Clears `rejectionReason`.
**Response 200:** `{ "message": "approved", "data": <listing> }`. Audit: `listing.approve`.

### 5.7 POST `/admin/listings/:id/reject`
**Auth:** super_admin/admin. **Body:** `{ "reason": "low quality images" }`
Sets `status: rejected`, `rejectionReason`.
**Response 200:** `{ "message": "rejected", "data": <listing> }`. Audit: `listing.reject`.

### 5.8 POST `/admin/listings/:id/pause`
**Auth:** super_admin/admin. Sets `status: paused`.
**Response 200:** `{ "message": "paused", "data": <listing> }`. Audit: `listing.pause`.

### 5.9 POST `/admin/listings/:id/activate`
**Auth:** super_admin/admin. Sets `status: active`.
**Response 200:** `{ "message": "activated", "data": <listing> }`. Audit: `listing.activate`.

### 5.10 POST `/uploads/presign`
**Auth:** admin. Returns S3 presigned PUT URLs.
**Body:**
```json
{ "filesMeta": [{ "fileName": "a.jpg", "contentType": "image/jpeg" }] }
```
**Response 200:**
```json
{ "ok": true, "uploads": [ { "url": "...", "key": "listings/admin/<adminId>/<ts>_0_a.jpg", "publicUrl": "..." } ] }
```

---

## 6. Bookings

> User-facing bookings live at `/bookings` (`GET /bookings` is **scoped to the caller**). Use `/admin/bookings` for unscoped views.

### 6.1 GET `/admin/bookings`
**Auth:** admin.
**Query:** `?page&limit&sort&status=&listingId=&guestId=&from=&to=`
`status` accepts any of: `pending`, `accepted`, `rejected`, `cancelled_by_guest`, `cancelled_by_admin`, `completed`, `no_show`.
**Response 200:**
```json
{
  "data": [{
    "_id": "...",
    "listingId": { "_id": "...", "title": "...", "imageUrls": [...], "city": "..." },
    "guestId":   { "_id": "...", "name": "...", "email": "...", "phone": "..." },
    "checkInDate": "...", "checkOutDate": "...",
    "guests": { "adults": 2, "children": 0, "infants": 0, "pets": 0 },
    "status": "accepted",
    "rejectionReason": null, "cancellationReason": null,
    "createdAt": "...", "updatedAt": "..."
  }],
  "pagination": { ... }
}
```

### 6.2 GET `/admin/bookings/:id`
**Auth:** admin.
**Response 200:** `{ "data": <booking with listingId + guestId populated> }`.

### 6.3 POST `/admin/bookings/:id/cancel`
**Auth:** super_admin/admin.
**Body:** `{ "reason": "host emergency" }`
Sets `status: cancelled_by_admin`, `cancellationReason`, `cancelledAt`, `cancelledByAdminId`.
**Response 200:** `{ "message": "booking cancelled", "data": <booking> }`. Audit: `booking.cancel`.

> Admin accept/reject are not exposed as admin routes yet (handlers exist in `controllers/booking.controller.js` if you want them mounted).

---

## 7. Payments

### 7.1 GET `/admin/payments`
**Auth:** admin.
**Query:** `?page&limit&sort&status=created|captured|failed|refunded|partially_refunded&userId=&bookingId=&from=&to=`
**Response 200:**
```json
{
  "data": [{
    "_id": "...", "userId": { "_id":"...","name":"...","email":"...","phone":"..." },
    "bookingId": "...", "amount": 2500, "currency": "INR",
    "status": "captured", "provider": "razorpay",
    "razorpayOrderId": "...", "razorpayPaymentId": "...",
    "refundedAmount": 0, "refunds": [],
    "createdAt": "...", "updatedAt": "..."
  }],
  "pagination": { ... }
}
```

### 7.2 GET `/admin/payments/:id`
**Auth:** admin.
**Response 200:** `{ "data": <payment with userId populated> }`.

### 7.3 POST `/admin/payments/:id/refund`
**Auth:** super_admin/admin.
**Body:** `{ "amount": 2500, "reason": "guest cancel" }`
Updates `refundedAmount`, appends to `refunds[]` with `processedByAdminId`, sets `status` to `refunded` or `partially_refunded`.
**Response 200:** `{ "message": "refund initiated", "data": <payment> }`. Audit: `payment.refund`.
**Errors:** `422` amount missing or exceeds captured amount.

> **Note:** this records the refund on our side; it does **not** call the Razorpay refund API yet. See documentation.md §8.

---

## 8. Feedbacks (Reviews)

### 8.1 GET `/admin/feedbacks`
**Auth:** admin.
**Query:** `?page&limit&sort&listingId=&userId=&minRating=&maxRating=&hasReview=true|false`
**Response 200:**
```json
{
  "data": [{
    "_id": "...",
    "listing": { "_id": "...", "title": "..." },
    "user":    { "_id": "...", "name": "...", "email": "..." },
    "rating": 4, "reviewText": "...",
    "createdAt": "..."
  }],
  "pagination": { ... }
}
```

### 8.2 DELETE `/admin/feedbacks/:id`
**Auth:** super_admin/admin. **Body:** —
**Response 200:** `{ "message": "deleted", "data": <feedback> }`. Audit: `feedback.delete`.

---

## 9. Featured Areas

CRUD lives at the existing `/featured-areas` endpoint (admin-gated for writes). No dedicated `/admin/featured-areas` namespace.

### 9.1 GET `/featured-areas`
**Auth:** none. Returns the enriched geo-listing payload used by the homepage. Note: controller reads `req.userId` for favourite enrichment, so calling without an end-user token returns areas without favourite flags (and may yield `undefined` checks — see documentation.md §8).

### 9.2 POST `/featured-areas`
**Auth:** admin. **Body:**
```json
{
  "name": "Indiranagar",
  "location": { "type": "Point", "coordinates": [77.6408, 12.9784] },
  "radiusKm": 3,
  "imageUrl": "https://..."
}
```
**Response 201:** `{ "message": "Featured created successfully", "data": <area> }`.

> PATCH/DELETE for featured areas: not currently implemented as routes (controllers exist for create/get only). If you need updates/deletes from the admin panel, wire `updateFeatured` / `deleteFeatured` — these are not yet built.

---

## 10. Suggested Destinations

Writes are admin-only. Reads accept **either an admin token or a user token** (`authenticateAny` middleware) — the homepage uses them and the admin panel needs to list/edit them.

### 10.1 GET `/suggested-destinations`
**Auth:** user OR admin.
**Query:** `?q&page&limit&isActive=true|false`
**Response 200:**
```json
{
  "pagination": { "total": 0, "page": 1, "limit": 20, "pages": 0 },
  "data": [ <suggestion> ]
}
```

### 10.2 POST `/suggested-destinations`
**Auth:** admin. **Body:**
```json
{
  "place": "Goa",
  "location": { "type": "Point", "coordinates": [73.8278, 15.2993] },
  "imageUrl": "https://...",
  "isActive": true,
  "meta": { "tagline": "beaches" }
}
```
**Response 201:** `{ "message": "Suggestion created successfully", "data": <doc> }`.

### 10.3 POST `/suggested-destinations/bulk`
**Auth:** admin. **Body:** `[ <suggestion>, <suggestion>, ... ]`
**Response 201:** `{ "message": "Created", "count": N, "data": [...] }`.

### 10.4 GET `/suggested-destinations/:id` (user OR admin) · PUT `/suggested-destinations/:id` (admin) · DELETE `/suggested-destinations/:id` (admin)

---

## 11. KYC

### 11.1 GET `/admin/kyc`
**Auth:** admin.
**Query:** `?page&limit&sort&q&status=verified|failed|not_started|token_generated|link_generated|permission_granted|data_fetched`
**Response 200:**
```json
{
  "data": [{
    "_id": "...", "name": "...", "email": "...", "phone": "...",
    "aadhaar": true, "face": true, "faceMatchPercent": 92,
    "meonKyc": { "status": "verified", "completedAt": "..." }
  }],
  "pagination": { ... }
}
```

### 11.2 GET `/admin/kyc/:id`
**Auth:** admin. Returns full `meonKyc` subdoc plus the top-level KYC fields.
**Response 200:**
```json
{
  "data": {
    "_id": "...", "name": "...", "email": "...", "phone": "...",
    "aadhaar": true, "face": true, "faceUrl": "...", "faceMatchPercent": 92,
    "meonKyc": { ...full subdoc }
  }
}
```

### 11.3 POST `/admin/kyc/:id/override`
**Auth:** super_admin/admin. **Body:** `{ "status": "verified" | "failed", "reason": "..." }`
Sets `meonKyc.status` and `meonKyc.completedAt: now`.
**Response 200:** `{ "message": "kyc updated", "data": <user with meonKyc> }`. Audit: `kyc.override`.

---

## 12. Audit Log

### 12.1 GET `/admin/audit-logs`
**Auth:** super_admin/admin.
**Query:** `?page&limit&sort&actorAdminId=&action=&targetModel=&from=&to=`
**Response 200:**
```json
{
  "data": [{
    "_id": "...",
    "actorAdminId": { "_id": "...", "email": "...", "name": "...", "role": "admin" },
    "actorEmail": "...",
    "action": "booking.cancel",
    "target": { "model": "Booking", "id": "..." },
    "payload": { "reason": "..." },
    "ip": "...", "userAgent": "...",
    "createdAt": "..."
  }],
  "pagination": { ... }
}
```

Audit entries are written automatically by every mutating admin endpoint via [utils/auditLogger.js](utils/auditLogger.js). Known actions:

| Action | Where written |
| --- | --- |
| `admin.self.update` | `PATCH /admin/me` |
| `admin.create` / `admin.update` / `admin.delete` | `/admin/admins*` |
| `user.update` / `user.suspend` / `user.activate` / `user.delete` | `/admin/users/:id*` |
| `user.upgrade_to_host` / `user.downgrade_from_host` | `/admin/users/:id/(up|down)grade-*` |
| `host.create` / `host.update` | `/admin/hosts*` |
| `listing.approve` / `listing.reject` / `listing.pause` / `listing.activate` | `/admin/listings/:id/*` |
| `booking.cancel` | `/admin/bookings/:id/cancel` |
| `payment.refund` | `/admin/payments/:id/refund` |
| `feedback.delete` | `/admin/feedbacks/:id` |
| `kyc.override` | `/admin/kyc/:id/override` |

---

## 13. Endpoint matrix (everything wired)

| Path | Method | Auth |
| --- | --- | --- |
| `/admin/login` | POST | none |
| `/admin/logout` | POST | admin |
| `/admin/me` | GET, PATCH | admin |
| `/admin/dashboard/overview` | GET | admin |
| `/admin/admins` | GET, POST | super_admin |
| `/admin/admins/:id` | PATCH, DELETE | super_admin |
| `/admin/users` | GET | admin |
| `/admin/users/:id` | GET | admin |
| `/admin/users/:id` | PATCH, DELETE | super_admin/admin |
| `/admin/users/:id/suspend` | POST | super_admin/admin |
| `/admin/users/:id/activate` | POST | super_admin/admin |
| `/admin/users/:id/upgrade-to-host` | POST | super_admin/admin |
| `/admin/users/:id/downgrade-from-host` | POST | super_admin/admin |
| `/admin/users/:id/bookings` | GET | admin |
| `/admin/hosts` | POST | super_admin/admin |
| `/admin/hosts/:id` | PATCH | super_admin/admin |
| `/admin/listings` | GET | admin |
| `/admin/listings/:id` | GET | admin |
| `/admin/listings/:id/approve` | POST | super_admin/admin |
| `/admin/listings/:id/reject` | POST | super_admin/admin |
| `/admin/listings/:id/pause` | POST | super_admin/admin |
| `/admin/listings/:id/activate` | POST | super_admin/admin |
| `/listings` | POST, PATCH /:id, DELETE /:id | admin |
| `/admin/bookings` | GET | admin |
| `/admin/bookings/:id` | GET | admin |
| `/admin/bookings/:id/cancel` | POST | super_admin/admin |
| `/admin/payments` | GET | admin |
| `/admin/payments/:id` | GET | admin |
| `/admin/payments/:id/refund` | POST | super_admin/admin |
| `/admin/feedbacks` | GET | admin |
| `/admin/feedbacks/:id` | DELETE | super_admin/admin |
| `/admin/kyc` | GET | admin |
| `/admin/kyc/:id` | GET | admin |
| `/admin/kyc/:id/override` | POST | super_admin/admin |
| `/admin/audit-logs` | GET | super_admin/admin |
| `/featured-areas` | POST | admin |
| `/suggested-destinations` | POST, PUT /:id, DELETE /:id, POST /bulk | admin |
| `/uploads/presign` | POST | admin |

---

## 13a. User-facing Razorpay payment flow

Not strictly admin endpoints, but listed here for completeness — the admin panel may need to display data the mobile flow produces (orders, refunds, subscriptions). Full curl examples in [RAZORPAY_API_EXAMPLES.md](RAZORPAY_API_EXAMPLES.md).

### Booking
| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/api/v1/bookings/order` | user | Creates `Booking{status: pending_payment}` + Razorpay order. TTL 15 min. |
| POST | `/api/v1/bookings/verify` | user | HMAC of `${orderId}\|${paymentId}` + cross-check with `GET /v1/payments/:id` → `status: confirmed`. Idempotent. |
| POST | `/api/v1/bookings/:bookingId/cancel` | user | Refund per `cancellationPolicy` (Flexible/Moderate/Strict). Service fee non-refundable. |

### Subscription
| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/api/v1/subscriptions/order` | user | Server-side price (₹199 / 30d). Rejects if already active. |
| POST | `/api/v1/subscriptions/verify` | user | Activates `Subscription` with `activeUntil = now + 30d`. |
| GET | `/api/v1/subscriptions/me` | user | Single source of truth for the app. |

### Webhook
| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/api/v1/payments/razorpay/webhook` | Razorpay HMAC | Mounted **before** `express.json()`. Verifies HMAC over raw body. Dedups on `X-Razorpay-Event-Id`. |

### New error codes (returned in `{ code, message }` shape)
`SIGNATURE_MISMATCH`, `AMOUNT_MISMATCH`, `ORDER_BOOKING_MISMATCH`, `BOOKING_NOT_PENDING`, `PAYMENT_EXPIRED`, `PAYMENT_NOT_CAPTURED`, `PAYMENT_GATEWAY`, `ALREADY_CONFIRMED` (409), `ALREADY_ACTIVE`, `NOT_CANCELABLE`, `REFUND_FAILED`, `UNKNOWN_PLAN`, `INTENT_NOT_PENDING`.

### Admin refund (changed)
The admin endpoint `POST /admin/payments/:id/refund` now actually calls Razorpay's refund API (was previously local-only). It refuses to run if the `Payment` doc has no `razorpayPaymentId`. On Razorpay failure it returns `502` and does not mutate local state.

### Booking model — new fields
`amountPaise`, `subtotalPaise`, `taxPaise`, `serviceFeePaise`, `currency`, `razorpayOrderId`, `razorpayPaymentId` (unique sparse), `razorpaySignature`, `cancellationPolicy`, `confirmedAt`, `expiresAt`, `refundAmountPaise`, `refundStatus`, `razorpayRefundId`. New statuses: `pending_payment`, `confirmed`, `cancelled`, `expired`, `failed` (legacy statuses still accepted in the enum for back-compat).

### New models
- `Subscription` — see [models/subscription.model.js](models/subscription.model.js).
- `PaymentEvent` — webhook log + idempotency, see [models/paymentEvent.model.js](models/paymentEvent.model.js).
- `Listing` — added `cancellationPolicy: enum['flexible','moderate','strict']`, default `'moderate'`.

---

## 14. Not yet implemented (future work)

These were considered but not built. They're optional and easy to add later.

1. **`GET /admin/dashboard/trends`** — time-series bucketing for charts.
2. **Admin accept/reject for bookings** — `acceptBooking` / `rejectBooking` controllers exist but no admin route is mounted (admin cancel works).
3. **PATCH/DELETE `/admin/featured-areas/:id`** — only create/list exist; update/delete controllers would need building.
4. **`Feedback.isHidden`** soft-moderation — schema field not added; admin deletes are hard.
5. **Razorpay refund API call** — `/admin/payments/:id/refund` records the refund locally but does not call `razorpay.payments.refund(...)`.
6. **Host self-serve endpoints** — hosts can't create/edit their own listings today; admins do it for them via `POST /listings` with `hostId`.
7. **Existing listing data migration** — old listings had `hostId` pointing to `Admin`. Wipe or migrate to `User` references before going live.

Open these as separate tasks when needed.
