# Razorpay-flow API — curl examples

Base URL: `http://localhost:9000/api/v1` (dev) · `https://api.stayfinderindia.net/api/v1` (prod)

All requests below require `Authorization: Bearer <USER_JWT>` (the user app's JWT) unless noted.

---

## 1. Create a booking order

```bash
curl -X POST http://localhost:9000/api/v1/bookings/order \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "listingId": "6a157ad55446d9ae8e411126",
    "checkInDate": "2026-06-01",
    "checkOutDate": "2026-06-04",
    "guests": { "adults": 2, "children": 1, "infants": 0, "pets": 0 },
    "message": ""
  }'
```

**201 response:**
```json
{
  "bookingId": "6a17f1ad55446d9ae8e41a23",
  "orderId": "order_NXXXXXXXXX",
  "amount": 162400,
  "currency": "INR",
  "breakdown": {
    "nights": 3,
    "subtotalPaise": 145000,
    "taxPaise": 17400,
    "serviceFeePaise": 9900,
    "amountPaise": 172300
  },
  "expiresAt": "2026-05-28T10:20:00Z"
}
```

**Error codes:** `VALIDATION`, `INVALID_DATES`, `LISTING_UNAVAILABLE`, `ADULT_REQUIRED`, `CAPACITY_EXCEEDED`, `INFANTS_EXCEEDED`, `PETS_EXCEEDED`, `DATES_UNAVAILABLE`, `PAYMENT_GATEWAY`.

---

## 2. Verify booking payment (after Razorpay Checkout success)

```bash
curl -X POST http://localhost:9000/api/v1/bookings/verify \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "bookingId": "6a17f1ad55446d9ae8e41a23",
    "razorpayOrderId": "order_NXXXXXXXXX",
    "razorpayPaymentId": "pay_NYYYYYYYYY",
    "razorpaySignature": "abc123…"
  }'
```

**200 response:** `{ "bookingId": "…", "status": "confirmed" }`

**Error codes:** `VALIDATION`, `FORBIDDEN`, `ORDER_BOOKING_MISMATCH`, `BOOKING_NOT_PENDING`, `PAYMENT_EXPIRED`, `SIGNATURE_MISMATCH`, `PAYMENT_NOT_CAPTURED`, `AMOUNT_MISMATCH`, `ALREADY_CONFIRMED` (409).

---

## 3. Cancel a booking (guest, with refund per policy)

```bash
curl -X POST http://localhost:9000/api/v1/bookings/6a17f1ad55446d9ae8e41a23/cancel \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{ "reason": "change of plans" }'
```

**200 response:**
```json
{
  "bookingId": "6a17f1ad55446d9ae8e41a23",
  "status": "cancelled",
  "refundAmount": 145000,
  "refundCurrency": "INR",
  "refundEstimatedDays": "5 to 7 business days",
  "breakdown": {
    "refundFraction": 1.0,
    "subtotalRefundPaise": 145000,
    "taxRefundPaise": 17400,
    "serviceFeeRefundPaise": 0,
    "totalRefundPaise": 162400,
    "policy": "moderate",
    "ruleAppliedHoursBefore": 120,
    "hoursBeforeCheckIn": 168.5
  }
}
```

**Error codes:** `VALIDATION`, `FORBIDDEN`, `NOT_CANCELABLE`, `REFUND_FAILED`.

---

## 4. Subscription — create order

```bash
curl -X POST http://localhost:9000/api/v1/subscriptions/order \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{ "plan": "premium_monthly" }'
```

**201 response:**
```json
{
  "intentId": "6a18002...",
  "orderId": "order_NXXXXXXXXX",
  "amount": 19900,
  "currency": "INR",
  "plan": "premium_monthly",
  "expiresAt": "2026-05-28T10:20:00Z"
}
```

**400 response if already active:**
```json
{ "code": "ALREADY_ACTIVE", "message": "You already have an active subscription", "data": { "plan": "premium_monthly", "activeUntil": "2026-06-30T00:00:00Z" } }
```

---

## 5. Subscription — verify

```bash
curl -X POST http://localhost:9000/api/v1/subscriptions/verify \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "intentId": "6a18002...",
    "razorpayOrderId": "order_NXXXXXXXXX",
    "razorpayPaymentId": "pay_NYYYYYYYYY",
    "razorpaySignature": "abc123…"
  }'
```

**200 response:**
```json
{ "status": "active", "plan": "premium_monthly", "activeUntil": "2026-07-05T10:00:00Z", "lastPaymentId": "pay_NYYYYYYYYY" }
```

---

## 6. Subscription — read current state (source of truth)

```bash
curl http://localhost:9000/api/v1/subscriptions/me \
  -H "Authorization: Bearer $USER_JWT"
```

**200 responses:**
```json
{ "status": "active",  "plan": "premium_monthly", "activeUntil": "2026-07-05T10:00:00Z" }
{ "status": "expired", "plan": "premium_monthly", "activeUntil": "2026-05-01T10:00:00Z" }
{ "status": "none",    "plan": null, "activeUntil": null }
```

---

## 7. Razorpay webhook (Razorpay → us)

The mobile/admin apps never call this. Razorpay posts events to:
```
POST https://api.stayfinderindia.net/api/v1/payments/razorpay/webhook
X-Razorpay-Signature: <hex>
X-Razorpay-Event-Id:  <uuid>
Content-Type: application/json

{ "event": "payment.captured", "payload": { "payment": { "entity": { ... } } }, "created_at": 1700000000 }
```

We verify HMAC over the **raw body** with `RAZORPAY_WEBHOOK_SECRET` and dedupe on `X-Razorpay-Event-Id`. Events handled today: `payment.captured`, `payment.failed`, `refund.created`, `refund.processed`, `refund.failed`. Unknown events log + 200.

**Dashboard config** — Razorpay Dashboard → Settings → Webhooks:
- URL: `https://api.stayfinderindia.net/api/v1/payments/razorpay/webhook`
- Active events: tick `payment.captured`, `payment.failed`, `refund.created`, `refund.processed`, `refund.failed`.
- Secret: any strong value — paste the same string into `RAZORPAY_WEBHOOK_SECRET` env var on the server.

---

## 8. Admin refund (now actually hits Razorpay)

```bash
curl -X POST http://localhost:9000/api/v1/admin/payments/<paymentId>/refund \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{ "amount": 100000, "reason": "ops adjustment" }'
```

Amount in paise. The admin refund endpoint now calls `razorpay.payments.refund()` synchronously, persists the Razorpay refund id, and only mutates local state if Razorpay accepts the call.

**Errors:** `422` payment has no `razorpayPaymentId` / amount exceeds captured · `502` Razorpay rejected the refund.
