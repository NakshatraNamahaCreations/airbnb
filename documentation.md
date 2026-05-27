# Stay Finder — Backend Documentation

A short-stay / Airbnb-style booking platform backend. This document captures the architecture, data model, authentication flow, and the full REST surface (end-user + admin panel).

> **Status:** Admin panel backend is implemented. See [backend_data.md](backend_data.md) for endpoint-level request/response detail.

---

## 1. Tech Stack

| Layer | Choice |
| --- | --- |
| Runtime | Node.js (ES modules, `"type": "module"`) |
| Framework | Express 5 |
| Database | MongoDB via Mongoose 8 |
| Auth | JWT (`jsonwebtoken`) + bcrypt for admin password hashing |
| File Storage | AWS S3 (presigned PUT URLs via `@aws-sdk/s3-request-presigner`) |
| Payments | Razorpay SDK (wired in `services/payment.service.js`) |
| SMS / OTP | Custom util `utils/sendOtpSms.js` |
| KYC | Meon (Aadhaar + PAN) + IPV (face-match) |
| Logging | Winston + Morgan |
| Misc | `compression`, `cors`, `cookie-parser`, `express-rate-limit`, `dayjs`, `uuid` |

Entry point: [index.js](index.js). Default port: `9000`.

CORS allow-list: `http://localhost:5173`, `http://127.0.0.1:5500`, `http://192.168.0.157:9000`, `https://api.stayfinderindia.net`, `https://api.stayfinder.com`, `https://api.stayfinder.in`, plus anything in `process.env.FRONTEND_URLS` (comma-separated).

In dev (`NODE_ENV !== 'production'`) **any** `http://localhost:<port>` or `http://127.0.0.1:<port>` origin is allowed automatically. Allowed methods: `GET, POST, PUT, DELETE, PATCH, OPTIONS`. Allowed headers: `Content-Type, Authorization`. Credentials enabled.

---

## 2. High-Level Architecture

```
client (mobile / web / admin panel)
        │
        ▼
   Express app  ──► routes/*  ──► controllers/*  ──► models/* (Mongoose)
        │                         │
        │                         └─► services/*  (booking, payment)
        │
        ├─► utils/* (createToken, sendOtpSms, logger, error, pagination, auditLogger)
        ├─► middlewares/* (auth, asyncHandler, rateLimit)
        ├─► scripts/* (seed scripts, one-offs)
        └─► config/* (db, s3, stockImages)
```

Folder map:

- [controllers/](controllers/) — request handlers (one per resource, plus admin)
- [routes/](routes/) — Express routers
- [models/](models/) — Mongoose schemas
- [services/](services/) — booking & payment business logic
- [middlewares/](middlewares/) — `authenticate`, `authenticateAdmin`, `authenticateAny`, `authorizeRoles`, `authorizeAdminRoles`, `asyncHandler`
- [middleware/rateLimit.js](middleware/rateLimit.js) — OTP rate limiter (singular folder, separate from `middlewares/`)
- [config/](config/) — DB connection, S3 client, stock images
- [constants/enums.js](constants/enums.js) — STATES, AMENITIES, roles, suggested destinations
- [utils/](utils/) — JWT minting, error classes, logger, OTP helpers, pagination, audit logger
- [scripts/](scripts/) — one-off scripts (e.g. seed super-admin)

API base path: `/api/v1`.

---

## 3. Data Model

### 3.1 User — [models/user.model.js](models/user.model.js)
Mobile-first user. Created during OTP verification + registration.

Key fields:
- `phone` (unique, required) — login identity
- `email` (unique, sparse — multiple nulls allowed)
- `name`, `dateOfBirth`
- `roles: [String]` — enum `['guest', 'host', 'admin']`, default `['guest']`
- `status` — enum `['active', 'suspended', 'deleted']`, default `'active'`, indexed
- `suspendedAt`, `suspensionReason`
- `profile`: `{ age, gender, location }`
- `preferences`: `Map<String, String>`
- `recentlyViewed: [{ listing: ObjectId(Listing), viewedAt }]`
- `hostProfile`: `{ payoutDetails: { bankName, accountNumber, ifsc }, documents: [String], wishlistIds: [ObjectId(Wishlist)] }`
- `aadhaar: Boolean`, `face: Boolean`, `faceUrl`, `faceMatchPercent`
- `meonKyc`: nested object with `aadhaar`, `pan`, `status` enum (`not_started` → `verified`/`failed`), `redirectUrl`, `lastInitiatedAt`, `lastResponse`, `completedAt`

The `authenticate` middleware rejects requests from users whose `status` is `suspended` or `deleted`.

### 3.2 Admin — [models/admin.model.js](models/admin.model.js)
Separate collection from `User`. Used by the admin panel.

Fields:
- `email` (unique, required), `password` (bcrypt hash, required)
- `phone`, `name`
- `role` — enum `['super_admin', 'admin', 'support']`, default `'admin'`
- `status` — enum `['active', 'suspended']`, default `'active'`
- `lastLoginAt`
- timestamps

Admins are seeded via [scripts/seedSuperAdmin.js](scripts/seedSuperAdmin.js). There is no public signup.

### 3.3 Listing — [models/listing.model.js](models/listing.model.js)
`hostId` is an `ObjectId` ref to **`User`** (must have the `host` role). `createdByAdminId` records which admin created the listing on behalf of the host.

Fields: `hostId` (ref User), `createdByAdminId` (ref Admin), `title`, `description`, `imageUrls[]`, `address`, `city`, `state` (enum STATES), `pincode`, `amenities[]` (enum AMENITIES), `location` (GeoJSON Point + 2dsphere index), `pricePerNight`, `currency` (default `INR`), `bedrooms`, `houseRules[]`, `safetyAndProperty[]`.

**Capacity model** (changed — no longer per-category caps):
- `maxGuests` (required, min 1) — the single shared cap; a booking's `adults + children` must not exceed it.
- `maxInfants` (default 0) — infants do **not** count toward `maxGuests`; capped separately.
- `maxPets` (default 0) — pets do **not** count toward `maxGuests`; `0` means pets not allowed.

So a listing with `maxGuests: 4` accepts any people mix summing to ≤ 4 (4 adults, or 2 adults + 2 children, etc.). There is no fixed adults/children split. Booking-time rules also require **at least 1 adult**.

Moderation fields:
- `status` — enum `['active', 'paused', 'draft', 'pending_review', 'approved', 'rejected']`, default `'active'`, indexed
- `rejectionReason`, `approvedAt`, `approvedByAdminId`

### 3.4 Booking — [models/booking.model.js](models/booking.model.js)
`listingId` → Listing, `guestId` → User, `checkInDate`, `checkOutDate`, `guests {adults, children, infants, pets}`, `message`.

Status fields:
- `status` — enum `['pending', 'accepted', 'rejected', 'cancelled_by_guest', 'cancelled_by_admin', 'completed', 'no_show']`, default `'pending'`, indexed
- `rejectionReason`, `cancellationReason`, `cancelledAt`, `cancelledByAdminId`, `completedAt`

### 3.5 Wishlist & Favorite — [models/wishlist.model.js](models/wishlist.model.js), [models/favorite.model.js](models/favorite.model.js)
- Wishlist: `name`, `user` — unique per `(user, name)`.
- Favorite: `wishlist`, `listing`, `user` — unique per `(wishlist, listing)`; indexed on `(user, listing)`.

### 3.6 Feedback — [models/feedback.model.js](models/feedback.model.js)
`listing`, `user`, `rating (1–5)`, `reviewText`, `createdAt`. One feedback per `(user, listing)` enforced at controller level via upsert.

### 3.7 FeaturedArea — [models/featured.model.js](models/featured.model.js)
Curated geo-areas on the homepage. `name`, `location` (Point + 2dsphere), `radiusKm` (default 3), `imageUrl`.

### 3.8 Suggestion — [models/suggestion.model.js](models/suggestion.model.js)
Suggested destinations carousel. `place`, `location` (Point), `imageUrl`, `isActive`, `meta` (Map).

### 3.9 Payment — [models/payment.model.js](models/payment.model.js)
Expanded model.

Fields:
- `userId` (ref User, indexed), `bookingId` (ref Booking, indexed)
- `amount`, `currency` (default `INR`)
- `status` — enum `['created', 'captured', 'failed', 'refunded', 'partially_refunded']`, default `'created'`, indexed
- `provider` (default `'razorpay'`), `razorpayOrderId`, `razorpayPaymentId`, `razorpaySignature`
- `refundedAmount`, `refunds[]: { refundId, amount, reason, status, createdAt, processedByAdminId }`
- `failureReason`, `capturedAt`, `meta`, timestamps

### 3.10 OtpSession — [models/otpSession.model.js](models/otpSession.model.js)
`sessionId` (uuid), `phone`, `otpHash` (bcrypt), `status` (`pending|verified|consumed|expired`), `attempts`, `verifiedAt`, `expiresAt` (TTL index — auto-deletes at expiry).

### 3.11 AuditLog — [models/auditLog.model.js](models/auditLog.model.js)
Append-only log of admin actions.

Fields:
- `actorAdminId` (ref Admin, indexed), `actorEmail`
- `action` (e.g. `user.suspend`, `listing.approve`), indexed
- `target: { model, id }`
- `payload` (request body / diff)
- `ip`, `userAgent`
- `createdAt` only (no updates)

Written automatically by [utils/auditLogger.js](utils/auditLogger.js) `writeAudit(req, { action, target, payload })`. Audit failures are swallowed (logged but never fail the underlying action).

---

## 4. Authentication & Authorization

### 4.1 End-User Auth (phone OTP)
1. `POST /auth/otp` — start OTP. Server normalises Indian mobile, expires prior pending sessions, hashes a 6-digit OTP, stores an `OtpSession`, sends SMS. Returns `{ sessionId, expiresInMinutes }`.
2. `POST /auth/otp/verify` — caller passes `{ sessionId, phone, otp }`. Server marks the session `verified` and either:
   - returns `{ data: { token, isNew: false, user } }` if a `User` exists for the phone, or
   - returns `{ data: { isNew: true, required: ['name','dateOfBirth','email'], phone } }` (no token yet).
3. `POST /auth/register` — for new users; submits the required fields with the verified `sessionId`. Server creates the `User`, consumes the session, and returns `{ data: { token, isNew: true, user } }`.

JWT payload (user): `{ userId, userRoles, email }`. TTL 30 days. Signed with `process.env.JWT_SECRET`. See [utils/createToken.js](utils/createToken.js).

### 4.2 Admin Auth (email + password)
- `POST /admin/login` — `{ email, password }` → `{ token, admin }`. Sets `jwt` httpOnly cookie (sameSite=strict, 30d).
- `POST /admin/logout` — clears the cookie.
- **No public signup.** Admins are created via [scripts/seedSuperAdmin.js](scripts/seedSuperAdmin.js) (super-admins) or `POST /admin/admins` (super-admin only).

JWT payload (admin): `{ userId: admin._id, userRoles: 'admin', email }`.

### 4.3 Middlewares — [middlewares/authMiddleware.js](middlewares/authMiddleware.js)
- `authenticate` — reads `Authorization: Bearer …`, verifies JWT, loads `User` by `decoded.userId`. Rejects suspended/deleted users. Sets `req.user`, `req.userId`.
- `authorizeRoles(...allowedRoles)` — checks `req.user.roles` overlap (used for `host`-only endpoints).
- `authenticateAdmin` — reads cookie `jwt` or `Authorization: Bearer …`, verifies, loads `Admin` by `decoded.userId`. Rejects suspended admins. Sets `req.admin`, `req.adminId`, `req.adminRole`.
- `authorizeAdminRoles(...allowedRoles)` — restricts to specific admin roles (`super_admin`, `admin`, `support`).
- `authenticateAny` — accepts **either** an admin token or a user token. Tries `Admin.findById(decoded.userId)` first, falls back to `User`. Sets `req.admin`/`req.adminId` OR `req.user`/`req.userId`. Used on shared-read endpoints (e.g. `GET /suggested-destinations`) that both the admin panel and the user app need to call.

### 4.4 Seeding the first admin
```powershell
$env:SEED_ADMIN_EMAIL='admin@stayfinder.com'
$env:SEED_ADMIN_PASSWORD='SomeStrongPass!'
$env:SEED_ADMIN_ROLE='super_admin'   # optional, defaults to super_admin
node scripts/seedSuperAdmin.js
```

Idempotent: if the email already exists, the script logs and exits without overwriting.

---

## 5. REST Surface

All paths under `/api/v1`. Auth column:
- `none` = public
- `user` = `authenticate`
- `admin` = `authenticateAdmin`
- `super_admin` etc. = `authenticateAdmin + authorizeAdminRoles(...)`
- `host` = `authenticate + authorizeRoles('host')`

### 5.1 Auth — [routes/auth.routes.js](routes/auth.routes.js)
| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/otp` | none (rate-limited) | Start OTP |
| POST | `/auth/otp/verify` | none (rate-limited) | Verify OTP, login or signal new-user |
| POST | `/auth/register` | none | Create user after verified OTP |

### 5.2 Users — [routes/user.routes.js](routes/user.routes.js)
| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/users/me` | user | Current user document |
| GET | `/users/me/wishlists/overview` | user | Recently viewed + wishlists with cover images |
| PATCH | `/users/me/:id` | user | Self-update (name/email/DoB) — `:id` is ignored, uses `req.userId` |

### 5.3 Listings — [routes/listing.routes.js](routes/listing.routes.js)
| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/listings` | admin | Create listing for a host (`hostId` required in body) |
| PATCH | `/listings/:id` | admin | Update |
| DELETE | `/listings/:id` | admin | Delete |
| GET | `/listings` | user | Paginated list (`?page&limit&sort&q&status`) |
| GET | `/listings/me` | user | Listings where `hostId == req.userId` |
| GET | `/listings/nearby` | user | `$geoNear` |
| POST | `/listings/search` | user | Geo search with filters |
| GET | `/listings/recently-viewed` | user | Recently viewed |
| GET | `/listings/:id` | user | Detail + blockedDates + feedback summary + top reviews |

### 5.4 Bookings — [routes/booking.routes.js](routes/booking.routes.js)
| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/bookings/history` | user | Upcoming + previous bookings |
| POST | `/bookings` | user | Create booking (txn) |
| GET | `/bookings` | user | **Scoped** to current user; paginated |
| GET | `/bookings/:id` | user | Detail |
| PUT | `/bookings/:id` | user | Update |
| DELETE | `/bookings/:id` | user | Cancel |

### 5.5 Wishlists / Favorites — [routes/wishlist.routes.js](routes/wishlist.routes.js)
| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/wishlists/favorite` | user | Toggle favorite |
| POST | `/wishlists` | user | Create wishlist |
| GET | `/wishlists` | user | Caller's wishlists |
| GET | `/wishlists/:id` | user | Favorites in a wishlist |
| PATCH | `/wishlists/:id` | user | Rename |
| DELETE | `/wishlists/:id` | user | Delete |

### 5.6 Featured Areas — [routes/featured.routes.js](routes/featured.routes.js)
| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/featured-areas` | admin | Create |
| GET | `/featured-areas` | none | Public listing |
| GET | `/featured-areas/:id` | none | Detail |

### 5.7 Suggested Destinations — [routes/suggestion.routes.js](routes/suggestion.routes.js)
| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/suggested-destinations` | user OR admin | Paginated list (uses `authenticateAny`) |
| GET | `/suggested-destinations/:id` | user OR admin | Detail (uses `authenticateAny`) |
| POST | `/suggested-destinations` | admin | Create |
| POST | `/suggested-destinations/bulk` | admin | Bulk create |
| PUT | `/suggested-destinations/:id` | admin | Update |
| DELETE | `/suggested-destinations/:id` | admin | Delete |

### 5.8 Feedback — [routes/feedback.routes.js](routes/feedback.routes.js)
| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/feedbacks/:listingId` | user | Add/update own feedback |
| GET | `/feedbacks/:listingId` | user | All reviews for a listing |
| GET | `/feedbacks/:listingId/average` | user | Average rating |
| PUT | `/feedbacks/:listingId` | user | Update own feedback |
| DELETE | `/feedbacks/:listingId` | user | Delete own feedback |

### 5.9 KYC (Meon Aadhaar/PAN) — [routes/kyc.routes.js](routes/kyc.routes.js)
| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/identity-verifications/callback` | none | Meon redirect handler |
| GET | `/identity-verifications/generate-token` | user | Get Meon client token |
| POST | `/identity-verifications/get-digilocker-url` | user | Generate DigiLocker URL |
| POST | `/identity-verifications/retrieve-aadhaar` | user | Pull Aadhaar after DigiLocker grant |
| POST | `/identity-verifications/face-match` | user | Match face to Aadhaar photo |
| GET | `/identity-verifications/generate-aadhar-url` | user | Initiate Aadhaar KYC |

### 5.10 IPV (face token) — [routes/ipv.routes.js](routes/ipv.routes.js)
| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/ipv-verifications/webhook-ipv` | none | IPV provider webhook |
| POST | `/ipv-verifications/generate-face-token` | user | Mint face token |
| GET | `/ipv-verifications/export-ipv` | user | Export captured data |

### 5.11 Uploads — [routes/upload.routes.js](routes/upload.routes.js)
| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/uploads/presign` | admin | S3 presigned PUT URLs for listing images |

### 5.12 Payments — [routes/payment.routes.js](routes/payment.routes.js)
| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/payments` | user | Create payment |
| GET | `/payments` | user | List own payments |
| GET | `/payments/:id` | user | Detail |
| PUT | `/payments/:id` | user | Update |
| DELETE | `/payments/:id` | user | Delete |

### 5.13 Admin endpoints — [routes/admin.routes.js](routes/admin.routes.js)
See [backend_data.md](backend_data.md) for full request/response detail. Summary:

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/admin/login` | none |
| POST | `/admin/logout` | admin |
| GET | `/admin/me` | admin |
| PATCH | `/admin/me` | admin |
| GET | `/admin/dashboard/overview` | admin |
| GET | `/admin/admins` | super_admin |
| POST | `/admin/admins` | super_admin |
| PATCH | `/admin/admins/:id` | super_admin |
| DELETE | `/admin/admins/:id` | super_admin |
| GET | `/admin/users` | admin |
| GET | `/admin/users/:id` | admin |
| PATCH | `/admin/users/:id` | super_admin/admin |
| POST | `/admin/users/:id/suspend` | super_admin/admin |
| POST | `/admin/users/:id/activate` | super_admin/admin |
| DELETE | `/admin/users/:id` | super_admin/admin |
| POST | `/admin/users/:id/upgrade-to-host` | super_admin/admin |
| POST | `/admin/users/:id/downgrade-from-host` | super_admin/admin |
| GET | `/admin/users/:id/bookings` | admin |
| POST | `/admin/hosts` | super_admin/admin |
| PATCH | `/admin/hosts/:id` | super_admin/admin |
| GET | `/admin/listings` | admin |
| GET | `/admin/listings/:id` | admin |
| POST | `/admin/listings/:id/approve` | super_admin/admin |
| POST | `/admin/listings/:id/reject` | super_admin/admin |
| POST | `/admin/listings/:id/pause` | super_admin/admin |
| POST | `/admin/listings/:id/activate` | super_admin/admin |
| GET | `/admin/bookings` | admin |
| GET | `/admin/bookings/:id` | admin |
| POST | `/admin/bookings/:id/cancel` | super_admin/admin |
| GET | `/admin/payments` | admin |
| GET | `/admin/payments/:id` | admin |
| POST | `/admin/payments/:id/refund` | super_admin/admin |
| GET | `/admin/feedbacks` | admin |
| DELETE | `/admin/feedbacks/:id` | super_admin/admin |
| GET | `/admin/kyc` | admin |
| GET | `/admin/kyc/:id` | admin |
| POST | `/admin/kyc/:id/override` | super_admin/admin |
| GET | `/admin/audit-logs` | super_admin/admin |

---

## 6. Services & Utilities

- [services/booking.service.js](services/booking.service.js) — availability checks (`checkAvailability`), booking window management (`createBookingWindow`, `deleteBookingWindow`), `updateBooking`.
- [services/payment.service.js](services/payment.service.js) — Razorpay integration + `createPayment(userId, amount, session)` used inside `createBooking` transaction.
- [utils/createToken.js](utils/createToken.js) — `generateToken(userId, userRoles, email)`, `generateAdminToken(res, adminId, email)`.
- [utils/error.js](utils/error.js) — `AuthError`, `NotFoundError`, `ValidationError`, `ConflictError`.
- [utils/logger.js](utils/logger.js) — winston `apiLogger` with daily rotate.
- [utils/pagination.js](utils/pagination.js) — `parsePagination(query)` (returns `{ page, limit, skip, sort, q }`) + `buildPaginationMeta(total, page, limit)`.
- [utils/auditLogger.js](utils/auditLogger.js) — `writeAudit(req, { action, target, payload })`. Best-effort, never throws.
- [middleware/rateLimit.js](middleware/rateLimit.js) — `otpSendLimiter` applied to `/auth/otp` and `/auth/otp/verify`.
- [scripts/seedSuperAdmin.js](scripts/seedSuperAdmin.js) — one-off admin seeding.

---

## 7. Pagination & Listing Conventions

All list endpoints accept the common pagination query string:
```
?page=1&limit=20&sort=-createdAt&q=foo
```
- `page` defaults to `1` (min 1).
- `limit` defaults to `20` (clamped to `[1, 100]`).
- `sort` is a comma-separated list; `-` prefix = descending. Default `-createdAt`.
- `q` is a free-text search; each endpoint decides which fields to match.

Response envelope:
```json
{
  "message": "optional",
  "data": [...],
  "pagination": { "total": 123, "page": 1, "limit": 20, "pages": 7 }
}
```

---

## 8. Outstanding Items / Future Work

These are non-blocking but worth tracking:

- **Booking accept/reject admin routes** — controllers `acceptBooking` / `rejectBooking` exist but are not currently wired to admin routes. Admin can cancel via `/admin/bookings/:id/cancel`. If we want admin accept/reject, expose them.
- **Razorpay refund hook** — the refund endpoint records the refund on our `Payment` doc but does **not** call Razorpay's refund API. Wire `services/payment.service.js` to call `razorpay.payments.refund(...)`.
- **Dashboard trends endpoint** (`GET /admin/dashboard/trends`) — not implemented yet; only overview counts are shipped.
- **Feedback hide flag** — `Feedback.isHidden` is not on the schema. If soft-moderation is needed, add it; right now admin can only hard-delete a feedback.
- **Existing listings migration** — `Listing.hostId` was previously a ref to `Admin`. Any pre-existing documents with admin IDs in `hostId` will fail to populate as User. Migrate or wipe before going live.
- **Host self-serve** — no host-facing endpoints to create / edit own listings. Today admins do this on behalf of hosts.
- **`GET /featured-areas`** is public but the controller reads `req.userId` for favourite enrichment, which is `undefined` for anonymous calls. Either authenticate this route or make the favourite lookup conditional.

---

## 9. Local Setup Quick Reference

```powershell
# install
npm install

# env (see your existing .env)
#   MONGO_URI=...
#   JWT_SECRET=...
#   PORT=9000
#   FRONTEND_URLS=https://admin.stayfinder.com,...

# seed an admin once
$env:SEED_ADMIN_EMAIL='admin@stayfinder.com'
$env:SEED_ADMIN_PASSWORD='SomeStrongPass!'
node scripts/seedSuperAdmin.js

# run
npm run dev
```

Hit `POST /api/v1/admin/login` with those credentials; use the returned `token` in `Authorization: Bearer …` for every `/api/v1/admin/*` call.
