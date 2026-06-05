# Stay Findr — Flutter Backend Reference & Razorpay Migration

Hand this entire doc to the Flutter dev. It's their working reference for every API the mobile app calls. The Razorpay migration is the headline change — sections **6 (Bookings)** and **7 (Subscriptions)** are the substantive new work. Everything else is for completeness so they have one source of truth.

---

## 1. Why this exists (read first, then forward to the dev)

The Stay Findr backend is now the **single source of truth** for what's paid. The mobile app previously opened Razorpay Checkout with just `key + amount` and trusted `EVENT_PAYMENT_SUCCESS` to unlock bookings / premium. That callback is spoofable — an attacker could fake a success and get free bookings/subscriptions.

The new pattern, for both bookings and subscriptions, is:

1. App calls **`/order`** — server validates, creates a Razorpay order, returns `orderId`.
2. App opens **Razorpay Checkout** with `key + order_id + amount`. (`order_id` is the critical addition.)
3. On success, app calls **`/verify`** with `(orderId, paymentId, signature)`. Server verifies HMAC, cross-checks with Razorpay, and only then grants entitlement.

If the app skips step 3, the user gets nothing. By design.

A new endpoint **`GET /subscriptions/me`** is the only place the app should read subscription state from. The local `SubscriptionStorage` becomes a read-through cache, not the source of truth.

---

## 2. Conventions

| | |
|---|---|
| **Base URL (prod)** | `https://api.stayfinderindia.net/api/v1` |
| **Base URL (dev)** | `http://localhost:9000/api/v1` |
| **Auth header** | `Authorization: Bearer <jwt>` on every authenticated call. |
| **Content type (writes)** | `application/json` |
| **Money** | All amounts in **paise (integer)**. `19900` = ₹199. Display by dividing by 100. **Never send rupees to the server.** |
| **Dates (input)** | `YYYY-MM-DD` for calendar dates (check-in/check-out) or full ISO 8601 for timestamps. |
| **Dates (output)** | ISO 8601 UTC strings. Parse with `DateTime.parse()`. |
| **Error envelope** | `{ "code": "MACHINE_READABLE_CODE", "message": "Human readable" }` — your `BookingException.fromCode()` keeps working; unknown codes fall back to `message`. |
| **Pagination (list endpoints)** | `?page=1&limit=20&sort=-createdAt&q=foo`. Response wraps `data` + `pagination: { total, page, limit, pages }`. |
| **HTTP status** | `200/201` success · `400` validation/business rule · `401` not authenticated · `403` not authorised / suspended · `404` not found · `409` conflict / duplicate · `422` semantic validation · `5xx` server errors. |

### Razorpay key (in the app)

Only the **public** `KEY_ID` ever ships in the app, in `lib/config.dart`:

```dart
class Config {
  static const String razorpayKeyId = 'rzp_live_XXXXXXXXX'; // backend team will hand you the rotated value
}
```

The **secret** lives only on the server. Never paste it in the app, in repo, or in chat.

---

## 3. Auth (OTP)

Mobile-first login. Phone number is the identity. Indian mobile numbers only.

### 3.1 Start OTP

```http
POST /api/v1/auth/otp
Content-Type: application/json

{ "phone": "9876543210" }
```

`phone` may be 10-digit, `+91XXXXXXXXXX`, or with spaces — the server normalises.

**200:**
```json
{ "data": { "sessionId": "uuid-v4-string", "expiresInMinutes": 10 } }
```

Keep `sessionId` in memory. You'll need it for verify.

**Errors:** `429` rate-limited (OTP-send limiter), `422` `{ message: "phone required" }`.

### 3.2 Verify OTP

```http
POST /api/v1/auth/otp/verify
Content-Type: application/json

{ "sessionId": "uuid", "phone": "9876543210", "otp": "123456" }
```

**Two possible 200 shapes** — branch on `data.isNew`.

**Existing user (login):**
```json
{
  "data": {
    "token": "<jwt>",
    "isNew": false,
    "user": {
      "id": "...", "name": "Ramesh", "email": "ramesh@x.com",
      "dateOfBirth": "1990-04-12T00:00:00.000Z", "phone": "9876543210",
      "roles": ["guest"]
    }
  }
}
```
Store `token`. Set as `Authorization: Bearer <token>` for every subsequent request.

**New user (no account yet):**
```json
{
  "data": {
    "isNew": true,
    "required": ["name", "dateOfBirth", "email"],
    "phone": "9876543210"
  }
}
```
There's **no token yet**. Show the registration form, collect the required fields, then call `/auth/register`.

**Errors:**
| Code/Message | Meaning |
|---|---|
| `invalid_session` | sessionId/phone pair not found |
| `session_not_pending:<status>` | session was already verified/consumed/expired |
| `otp_expired` | 10-min window passed |
| `too_many_attempts` (429) | ≥ 5 wrong OTPs |
| `otp_incorrect` (with `attemptsLeft`) | wrong digits |

### 3.3 Register (new users only)

```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "sessionId": "uuid",
  "phone": "9876543210",
  "name": "Ramesh K",
  "email": "ramesh@x.com",
  "dateOfBirth": "1985-04-12"
}
```

**201:** same shape as the existing-user verify response —
```json
{
  "data": {
    "token": "<jwt>",
    "isNew": true,
    "user": { "id": "...", "name": "...", "email": "...", "dateOfBirth": "...", "phone": "...", "roles": ["guest"] }
  }
}
```

Store `token`. The session is now consumed; do not reuse it.

**Errors:** `422` missing fields; `400 session_not_verified` / `session_expired`.

### 3.4 JWT lifetime
30 days. Store securely (`flutter_secure_storage`). If a request returns `401`, treat as logout.

---

## 4. User profile

### 4.1 Get current user

```http
GET /api/v1/users/me
Authorization: Bearer <jwt>
```

**200:**
```json
{ "data": { "_id":"...", "phone":"...", "email":"...", "name":"...", "dateOfBirth":"...", "roles":["guest"], "status":"active", "recentlyViewed":[...], "meonKyc":{...}, "createdAt":"...", "updatedAt":"..." } }
```

`status` can be `"active" | "suspended" | "deleted"`. Suspended users will start getting `403 { code: "user_suspended" }` on every other request — treat that as forced logout.

### 4.2 Update self

```http
PATCH /api/v1/users/me/:id        (the :id is ignored, server uses the JWT)
Authorization: Bearer <jwt>
Content-Type: application/json

{ "name": "New name", "email": "x@y.com", "dateOfBirth": "1990-04-12" }
```

Any subset of `name | email | dateOfBirth`. Server normalises (trim, lowercase email, etc.).

**200:** `{ "data": { ...updated user fields... } }`

**Errors:** `name_too_short` (< 3 chars), `invalid_email`, `invalid_dateOfBirth`, `must_be_18_or_older`, `must_be_100_or_younger`.

---

## 5. Listings (browse, search, detail)

### 5.1 New capacity model — IMPORTANT

The old `listing.capacity = { adults, children, infants, pets }` object is **gone**. A listing now declares:

| Field | Meaning |
|---|---|
| `maxGuests` | Shared cap on `adults + children`. Any mix allowed. |
| `maxInfants` | Separate cap. Infants don't count toward `maxGuests`. |
| `maxPets` | Separate cap. `0` means pets not allowed. |
| `cancellationPolicy` | `"flexible" \| "moderate" \| "strict"`. Drives refund math. |

**Guest picker UI rule:**
- `adults + children + button` disables when `adults + children >= maxGuests`.
- `infants + button` disables at `maxInfants`.
- `pets + button` disables at `maxPets`; hide the pet stepper entirely if `maxPets === 0`.
- There must be **≥ 1 adult** in any booking (server enforces; you should disable Pay & Book until adults ≥ 1).

### 5.2 List listings (paginated)

```http
GET /api/v1/listings?page=1&limit=20&sort=-createdAt&q=goa
Authorization: Bearer <jwt>
```

Optional query: `status=active|approved` (defaults to all; for the guest app, you only show `active` or `approved`).

**200:**
```json
{
  "message": "host listings",
  "data": { "count": 20, "listings": [ /* listing objects */ ] },
  "pagination": { "total": 142, "page": 1, "limit": 20, "pages": 8 }
}
```

### 5.3 Search listings (geo + filters)

```http
POST /api/v1/listings/search?page=1&limit=10
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "searchQuery": "",
  "checkInDate": "2026-06-01",
  "checkOutDate": "2026-06-04",
  "location": { "latitude": 12.9716, "longitude": 77.5946, "radius": 3000 },
  "guests": { "adults": 2, "children": 1, "infants": 0, "pets": 0 }
}
```

- `radius` is in **metres**.
- `guests` filters: server uses `adults + children ≤ maxGuests`, `infants ≤ maxInfants`, `pets ≤ maxPets`. Dates exclude listings already booked.

**200:**
```json
{
  "message": "searchListings",
  "count": 7,
  "data": [
    {
      "_id": "...", "title": "Cozy Studio", "address": "...",
      "pricePerNight": 1450, "location": {...},
      "imageUrls": "https://...", "distance": 1234,
      "isFavorited": false,
      "maxGuests": 4, "maxInfants": 1, "maxPets": 0,
      "avgRating": 4.6
    }
  ]
}
```

### 5.4 Nearby listings

```http
GET /api/v1/listings/nearby?latitude=12.9716&longitude=77.5946&radius=3000
Authorization: Bearer <jwt>
```

Returns the same listing shape as 5.3 without filters.

### 5.5 Listing detail

```http
GET /api/v1/listings/:id?checkInDate=2026-06-01&checkOutDate=2026-06-04
Authorization: Bearer <jwt>
```

(date params optional — when present, `availability` is included)

**200:**
```json
{
  "message": "Listing fetched successfully",
  "data": {
    "listing": {
      "_id": "...", "hostId": "...", "title": "Cozy Studio", "description": "...",
      "imageUrls": ["https://...", "..."],
      "address": "...", "city": "Bangalore", "state": "Karnataka", "pincode": "560001",
      "amenities": ["WiFi","Kitchen"],
      "location": { "type": "Point", "coordinates": [77.5946, 12.9716] },
      "pricePerNight": 1450, "currency": "INR",
      "bedrooms": 2,
      "maxGuests": 4, "maxInfants": 1, "maxPets": 0,
      "cancellationPolicy": "moderate",
      "houseRules": ["No smoking"], "safetyAndProperty": ["First aid kit"],
      "status": "active", "createdAt": "...", "updatedAt": "..."
    },
    "isFavorited": true,
    "availability": true,
    "blockedDates": [
      { "checkInDate":"2026-06-10","checkOutDate":"2026-06-14","status":"confirmed" }
    ],
    "feedbackSummary": { "avgRating": 4.6, "totalRatings": 24, "totalReviews": 18 },
    "topReviews": [ { "rating":5, "reviewText":"...", "user":{ "name":"...", "createdAt":"..." } } ]
  }
}
```

`blockedDates` already includes both `confirmed` bookings and ones in `pending_payment` (so the calendar correctly greys out the 15-minute hold while someone else is paying).

`cancellationPolicy` — display it on the detail page so the user knows the refund rules before booking.

### 5.6 Recently viewed

```http
GET /api/v1/listings/recently-viewed
Authorization: Bearer <jwt>
```

**200:** `{ "message":"Recently viewed", "count": N, "data": [ { "listing": <listing>, "viewedAt": "..." } ] }`

---

## 6. Bookings — **NEW Razorpay flow** (replaces existing /bookings POST)

### 6.1 The 3 steps in code (Dart sketch)

```dart
// 1. order
final orderRes = await api.post('/bookings/order', body: {
  'listingId': listingId,
  'checkInDate': '2026-06-01',
  'checkOutDate': '2026-06-04',
  'guests': { 'adults': 2, 'children': 1, 'infants': 0, 'pets': 0 },
  'message': '',
});
final bookingId = orderRes['bookingId'];
final orderId   = orderRes['orderId'];
final amount    = orderRes['amount'];

// 2. checkout — CRITICAL: include order_id
_razorpay.open({
  'key':       Config.razorpayKeyId,
  'order_id':  orderId,
  'amount':    amount,
  'currency':  'INR',
  'name':      'Stay Findr',
  'description': 'Booking',
  'prefill':   { 'email': user.email, 'contact': user.phone },
});

// 3. on PaymentSuccessResponse
_razorpay.on(EVENT_PAYMENT_SUCCESS, (PaymentSuccessResponse r) async {
  final verifyRes = await api.post('/bookings/verify', body: {
    'bookingId':         bookingId,
    'razorpayOrderId':   r.orderId,
    'razorpayPaymentId': r.paymentId,
    'razorpaySignature': r.signature,
  });
  // verifyRes.status == 'confirmed' → show success
});
```

### 6.2 POST `/bookings/order` — create order

```http
POST /api/v1/bookings/order
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "listingId": "6a157ad55446d9ae8e411126",
  "checkInDate": "2026-06-01",
  "checkOutDate": "2026-06-04",
  "guests": { "adults": 2, "children": 1, "infants": 0, "pets": 0 },
  "message": "Honeymoon trip — arrival 8pm"
}
```

**201:**
```json
{
  "bookingId": "6a17f1ad55446d9ae8e41a23",
  "orderId":   "order_NXXXXXXXXX",
  "amount":    172300,
  "currency":  "INR",
  "breakdown": {
    "nights": 3,
    "subtotalPaise":   145000,
    "taxPaise":         17400,
    "serviceFeePaise":   9900,
    "amountPaise":     172300
  },
  "expiresAt": "2026-05-28T10:20:00.000Z"
}
```

- `breakdown` is server-authoritative pricing. Display ₹1,450 × 3 nights + 12% tax + ₹99 service fee = ₹1,723. Do **not** recompute on the client.
- `expiresAt` — deadline by which the user must complete payment (15 min default). After that the dates are released and the booking flips to `expired`.

**Error codes (HTTP 400 unless noted):**

| Code | Cause | UI message suggestion |
|---|---|---|
| `VALIDATION` | bad/missing fields | "Please check your details." |
| `INVALID_DATES` | check-out ≤ check-in, or invalid dates | "Check-out must be after check-in." |
| `LISTING_UNAVAILABLE` | listing paused/rejected/draft | "This stay is no longer available." |
| `ADULT_REQUIRED` | adults < 1 | "At least one adult is required." |
| `CAPACITY_EXCEEDED` | adults + children > `maxGuests` | "Too many guests for this stay." |
| `INFANTS_EXCEEDED` | infants > `maxInfants` | "Too many infants for this stay." |
| `PETS_EXCEEDED` | pets > `maxPets` or pets not allowed | "This stay doesn't allow pets." |
| `DATES_UNAVAILABLE` | overlap with another `confirmed`/`pending_payment` booking | "These dates just got booked. Pick different dates." |
| `PAYMENT_GATEWAY` | Razorpay create-order call failed | "Couldn't reach the payment gateway. Try again." |

### 6.3 Razorpay Checkout options

```dart
final options = {
  'key':        Config.razorpayKeyId,         // public KEY_ID, never the secret
  'order_id':   orderRes['orderId'],          // ← REQUIRED
  'amount':     orderRes['amount'],           // paise
  'currency':   orderRes['currency'],
  'name':       'Stay Findr',
  'description': 'Booking #${orderRes['bookingId']}',
  'prefill':    { 'email': user.email, 'contact': user.phone },
  'theme':      { 'color': '#FF385C' },
};
```

**Why `order_id` matters:** when present, Razorpay enforces that the payment is bound to that specific order. Without it, signature verification is meaningless because the signature can be valid for any order. This is the load-bearing fix.

### 6.4 POST `/bookings/verify` — verify signature

```http
POST /api/v1/bookings/verify
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "bookingId":         "6a17f1ad55446d9ae8e41a23",
  "razorpayOrderId":   "order_NXXXXXXXXX",
  "razorpayPaymentId": "pay_NYYYYYYYYY",
  "razorpaySignature": "abc123..."
}
```

**200:**
```json
{ "bookingId": "6a17f1...", "status": "confirmed" }
```

If the call is retried with the same `razorpayPaymentId` after success, you'll get the same 200 with `"idempotent": true`. Safe to retry on flaky connections.

**Only show the success screen on this 200.** If the app dies between `EVENT_PAYMENT_SUCCESS` and this call, the server's webhook handler will still confirm the booking — but the UX should always attempt `/verify` immediately.

**Error codes (HTTP 400 unless noted):**

| Code | Cause | UI message suggestion |
|---|---|---|
| `VALIDATION` | missing fields | "Please retry the payment." |
| `FORBIDDEN` (403) | not your booking | "This booking isn't yours." |
| `ORDER_BOOKING_MISMATCH` | order/booking pair mismatch | "Payment couldn't be linked. Contact support." |
| `BOOKING_NOT_PENDING` | already verified/cancelled/expired | "This booking can't be paid for anymore." |
| `PAYMENT_EXPIRED` | exceeded 15-min TTL | "Payment window expired. Start a new booking." |
| `SIGNATURE_MISMATCH` | HMAC failed | "Payment verification failed. Contact support." |
| `PAYMENT_NOT_CAPTURED` | Razorpay status ≠ captured | "Payment didn't complete. Try again." |
| `AMOUNT_MISMATCH` | paid amount ≠ expected | "Payment amount mismatch. Contact support." |
| `PAYMENT_GATEWAY` | gateway cross-check call failed | "Couldn't reach payment gateway. Try again." |
| `ALREADY_CONFIRMED` (409) | retry with a DIFFERENT paymentId | "Booking was already paid with another payment." |

### 6.5 POST `/bookings/:bookingId/cancel` — cancel + refund

```http
POST /api/v1/bookings/6a17f1ad55446d9ae8e41a23/cancel
Authorization: Bearer <jwt>
Content-Type: application/json

{ "reason": "Change of plans" }
```

**200:**
```json
{
  "bookingId": "6a17f1...",
  "status": "cancelled",
  "refundAmount": 162400,
  "refundCurrency": "INR",
  "refundEstimatedDays": "5 to 7 business days",
  "breakdown": {
    "refundFraction":         1.0,
    "subtotalRefundPaise":    145000,
    "taxRefundPaise":          17400,
    "serviceFeeRefundPaise":       0,
    "totalRefundPaise":       162400,
    "policy":                 "moderate",
    "ruleAppliedHoursBefore": 120,
    "hoursBeforeCheckIn":     168.5
  }
}
```

- **Service fee is never refunded** — that's the `serviceFeeRefundPaise: 0`.
- Tax is refunded proportionally to the subtotal refund fraction.
- Display `refundAmount / 100` rupees + `refundEstimatedDays` in the confirmation UI.

**Policy rules (snapshotted at booking time, doesn't change if the host edits the listing later):**

| Policy | Refund rules |
|---|---|
| **Flexible** | Full refund if cancelled ≥ 24h before check-in. Otherwise 0%. |
| **Moderate** | Full ≥ 5 days. 50% ≥ 1 day. 0% < 1 day. |
| **Strict** | 50% ≥ 7 days. 0% < 7 days. |

**Error codes:**

| Code | Cause |
|---|---|
| `VALIDATION` | invalid bookingId |
| `FORBIDDEN` | not your booking |
| `NOT_CANCELABLE` | booking is not in `confirmed` state |
| `REFUND_FAILED` | Razorpay rejected the refund (rare — retry) |

### 6.6 Read endpoints (scoped to caller)

```http
GET /api/v1/bookings/history
GET /api/v1/bookings?page=1&limit=20&status=confirmed
GET /api/v1/bookings/:id
```

`/history` returns `{ upcoming: [...], previous: [...] }` (previous includes `userRating` if the user reviewed).

The list (`GET /bookings`) is **always scoped to the caller's JWT** — it never returns other users' bookings.

A booking document in any of these responses now has:

```json
{
  "_id": "...",
  "listingId": "...",
  "guestId": "...",
  "checkInDate": "...", "checkOutDate": "...",
  "guests": { "adults": 2, "children": 1, "infants": 0, "pets": 0 },
  "message": "...",
  "status": "confirmed",        // see below
  "amountPaise": 172300, "subtotalPaise": 145000, "taxPaise": 17400, "serviceFeePaise": 9900,
  "currency": "INR",
  "cancellationPolicy": "moderate",
  "razorpayOrderId":  "order_...",
  "razorpayPaymentId": "pay_...",
  "confirmedAt": "...", "cancelledAt": null, "expiresAt": null,
  "refundAmountPaise": 0, "refundStatus": null, "razorpayRefundId": null,
  "createdAt": "...", "updatedAt": "..."
}
```

**Booking statuses you'll see:**

| status | Means |
|---|---|
| `pending_payment` | Order created, awaiting `/verify`. Will auto-expire after `expiresAt`. |
| `confirmed` | Paid and verified. The only "valid" booking state. |
| `cancelled` | Guest cancelled. `refundAmountPaise` indicates how much was refunded. |
| `cancelled_by_admin` | Admin cancelled. Treat like `cancelled` in UI. |
| `expired` | TTL ran out without verify. Dates are released. |
| `failed` | Razorpay reported `payment.failed`. |
| `completed` | After checkout date (set by background job — not used yet). |

Legacy statuses (`pending`, `accepted`, `rejected`) may appear on old data. Treat `accepted` like `confirmed` for display. New bookings will never have these.

---

## 7. Subscriptions — **NEW** (Premium, ₹199 / 30 days)

Same 3-step pattern as bookings. Plus a `/me` endpoint that replaces `SubscriptionStorage` as the source of truth.

### 7.1 POST `/subscriptions/order`

```http
POST /api/v1/subscriptions/order
Authorization: Bearer <jwt>
Content-Type: application/json

{ "plan": "premium_monthly" }
```

`plan` is a string id; today only `premium_monthly` exists. The server looks up the price; the client cannot influence it.

**201:**
```json
{
  "intentId": "6a18002...",
  "orderId":  "order_NXXXXXXXXX",
  "amount":   19900,
  "currency": "INR",
  "plan":     "premium_monthly",
  "expiresAt":"2026-05-28T10:20:00.000Z"
}
```

**400 if user already has an active sub:**
```json
{
  "code": "ALREADY_ACTIVE",
  "message": "You already have an active subscription",
  "data": { "plan": "premium_monthly", "activeUntil": "2026-06-30T00:00:00.000Z" }
}
```

On `ALREADY_ACTIVE`, skip the order flow and route the user to the "premium active" screen using `data.activeUntil`.

**Other errors:** `UNKNOWN_PLAN`, `PAYMENT_GATEWAY`.

### 7.2 Razorpay Checkout — identical pattern

```dart
_razorpay.open({
  'key':       Config.razorpayKeyId,
  'order_id':  intentRes['orderId'],
  'amount':    intentRes['amount'],     // 19900
  'currency':  'INR',
  'name':      'Stay Findr Premium',
  'description': 'Monthly subscription',
  'prefill':   { 'email': user.email, 'contact': user.phone },
});
```

### 7.3 POST `/subscriptions/verify`

```http
POST /api/v1/subscriptions/verify
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "intentId":          "6a18002...",
  "razorpayOrderId":   "order_NXXXXXXXXX",
  "razorpayPaymentId": "pay_NYYYYYYYYY",
  "razorpaySignature": "abc123..."
}
```

**200:**
```json
{
  "status":        "active",
  "plan":          "premium_monthly",
  "activeUntil":   "2026-07-05T10:00:00.000Z",
  "lastPaymentId": "pay_NYYYYYYYYY"
}
```

Idempotent on the same `paymentId` — retry safe.

**Error codes:**
| Code | Cause |
|---|---|
| `VALIDATION` | missing fields |
| `FORBIDDEN` | intent doesn't belong to caller |
| `ORDER_BOOKING_MISMATCH` | order/intent mismatch |
| `INTENT_NOT_PENDING` | intent is `expired/active/failed` |
| `PAYMENT_EXPIRED` | TTL exceeded |
| `SIGNATURE_MISMATCH`, `PAYMENT_NOT_CAPTURED`, `AMOUNT_MISMATCH`, `PAYMENT_GATEWAY` | same as bookings |

### 7.4 GET `/subscriptions/me` — **source of truth**

This is the single endpoint the app should read for premium state. Call it:
- On app launch.
- On profile screen open.
- On subscription screen open.
- Before unlocking any premium UI surface.

```http
GET /api/v1/subscriptions/me
Authorization: Bearer <jwt>
```

**200 — one of three shapes:**
```json
{ "status": "active",  "plan": "premium_monthly", "activeUntil": "2026-07-05T10:00:00.000Z" }
{ "status": "expired", "plan": "premium_monthly", "activeUntil": "2026-05-01T10:00:00.000Z" }
{ "status": "none",    "plan": null, "activeUntil": null }
```

`SubscriptionStorage` becomes a **read-through cache**: write into it whenever this endpoint returns, read from it for instant UI, but always re-fetch on screen mount. Never grant premium based on the local cache alone after app cold-start has had a chance to refresh it.

---

## 8. Wishlists & Favorites

### 8.1 Create wishlist

```http
POST /api/v1/wishlists
Authorization: Bearer <jwt>
Content-Type: application/json

{ "name": "Goa trip", "listingId": "<optional — adds this listing as first favorite>" }
```
**201:** `{ "message":"Wishlist created successfully", "data": { "_id":"...","name":"goa trip","user":"..." } }`
Names are normalised (lowercase + trim). Errors: `409` if name already exists for this user.

### 8.2 List my wishlists

```http
GET /api/v1/wishlists
Authorization: Bearer <jwt>
```
**200:** `{ "data": [ { "_id":"...","name":"goa trip","createdAt":"..." } ] }`

### 8.3 List favorites inside a wishlist

```http
GET /api/v1/wishlists/:id
Authorization: Bearer <jwt>
```
**200:** `{ "count": N, "data": [ { "_id":"fav_id","listing":{ "title":"...","imageUrls":[...] } } ] }`

### 8.4 Toggle a favorite

```http
POST /api/v1/wishlists/favorite
Authorization: Bearer <jwt>
Content-Type: application/json

{ "wishlistId": "wl_...", "listingId": "lst_..." }
```
- If the listing is already in any wishlist → removes it, returns 200 `"Favorite removed from wishlist"`.
- Else → adds it to the specified wishlist, returns 201 `"Favorite added to wishlist"`.

### 8.5 Rename / delete a wishlist

```http
PATCH /api/v1/wishlists/:id    Body: { "name": "new name" }
DELETE /api/v1/wishlists/:id
```

---

## 9. Feedback (reviews & ratings)

### 9.1 Add or update own review

```http
POST /api/v1/feedbacks/:listingId
Authorization: Bearer <jwt>
Content-Type: application/json

{ "rating": 5, "reviewText": "Great stay!" }
```
Upsert per `(user, listing)` — one review per user per listing. **201:** `{ "data": <feedback> }`.

### 9.2 List reviews for a listing

```http
GET /api/v1/feedbacks/:listingId
Authorization: Bearer <jwt>
```
**200:** `{ "count": N, "data": [ { "rating": 5, "reviewText":"...", "user":{ "name":"..." }, "createdAt":"..." } ] }`

### 9.3 Average rating

```http
GET /api/v1/feedbacks/:listingId/average
Authorization: Bearer <jwt>
```
**200:** `{ "avgRating": 4.6, "total": 18 }` or `{ "avgRating": 0, "total": 0 }`.

### 9.4 Update / delete own review

```http
PUT    /api/v1/feedbacks/:listingId   Body: { "rating":4, "reviewText":"..." }
DELETE /api/v1/feedbacks/:listingId
```

---

## 10. Discovery (homepage)

### 10.1 Featured areas (neighborhood spotlight)

```http
GET /api/v1/featured-areas
```
No auth. Returns `{ data: [ { name, enrichedListings: [ { _id, title, imageUrl, pricePerNight, avgRating, isFavorited, location } ] } ] }`.

> Bug to be aware of: this endpoint reads `req.userId` for `isFavorited` enrichment, so without a logged-in user `isFavorited` is always false. Send the JWT if available even though the route is technically open.

### 10.2 Suggested destinations

```http
GET /api/v1/suggested-destinations?page=1&limit=20
Authorization: Bearer <jwt>
```
**200:** `{ "pagination":{...}, "data": [ { "_id":"...","place":"Goa","imageUrl":"...","location":{...} } ] }`

---

## 11. KYC (Meon Aadhaar/PAN + Face Match)

No backend changes here; existing endpoints under `/identity-verifications/*` and `/ipv-verifications/*` continue to work as before. Refer to the older KYC integration doc you already have.

After successful KYC, `GET /users/me` shows:
```json
"aadhaar": true,
"face": true,
"faceUrl": "https://...",
"faceMatchPercent": 92,
"meonKyc": { "status": "verified", "aadhaar": {...}, "pan": {...}, "completedAt": "..." }
```

---

## 12. Out-of-band updates (Razorpay webhooks)

The app doesn't see webhooks directly, but they affect server state. Specifically:

- A refund processed by ops support → the user's booking shows `status: cancelled` and the refund details in `refundAmountPaise / refundStatus` next time the app loads it.
- A subscription extended by ops → `activeUntil` on `/subscriptions/me` increases.

So: **always re-fetch on screen mount.** Don't cache state from the last app session for more than the duration of the current session.

---

## 13. What to remove from the app

- ❌ Trusting `EVENT_PAYMENT_SUCCESS` to unlock a booking or premium without calling `/verify`.
- ❌ Computing booking amounts client-side from `pricePerNight * nights` and sending that to the server. The server computes; the client displays the server's `breakdown`.
- ❌ Reading `SubscriptionStorage` as the source of truth. Read it as a cache, write it from `/subscriptions/me` responses.
- ❌ Any debug "tap to unlock premium" shortcut. Delete it from the release build.
- ❌ Old listing capacity reads (`listing.capacity.adults`, etc.). Use `maxGuests / maxInfants / maxPets`.
- ❌ Old `POST /bookings` call (the random-amount endpoint). It no longer exists.

---

## 14. Local testing

The backend has separate **test mode** keys (`rzp_test_...`). Ask the backend team for them — they're not in the production environment. With test keys you can use Razorpay's [test cards](https://razorpay.com/docs/payments/payments/test-card-details/) (e.g. `4111 1111 1111 1111` + any future expiry + any CVV + OTP `1234`).

The backend may also be running locally at `http://localhost:9000/api/v1` — pointing the app there during development is fine; CORS already allows any `localhost:<port>` in dev mode.

---

## 15. Pre-ship checklist

Tick all of these before the production build:

- [ ] `lib/config.dart` has the **new** live `KEY_ID` (the rotated one). The leaked `rzp_live_SxWyxRusxeOBvq` is removed from the codebase entirely.
- [ ] Booking flow: `/order` → Razorpay Checkout **with `order_id`** → `/verify`. Success UI shown only after `/verify` returns 200.
- [ ] Subscription flow: same 3-step pattern.
- [ ] `/subscriptions/me` is the only thing the premium gate reads. Local storage is a cache.
- [ ] All error codes from §6.2, §6.4, §6.5, §7.3 are mapped in `BookingException.fromCode()`.
- [ ] Amounts in the UI are `value / 100` rupees. Server is sent paise / never rupees.
- [ ] Listing guest picker uses `maxGuests / maxInfants / maxPets` (no `capacity.*`).
- [ ] Listing detail UI shows the `cancellationPolicy`.
- [ ] No `EVENT_PAYMENT_SUCCESS`-only success path. No "tap to unlock premium" shortcut.
- [ ] All bookings/subscription screens re-fetch on mount (don't trust prior-session state).
- [ ] Test build verified end-to-end against `rzp_test_*` keys + a Razorpay test card, including the cancel/refund path.

If anything 4xx's that you don't expect, send the backend team the response body (the `code` field) and we'll fix the contract.

— Backend team
