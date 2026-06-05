# Razorpay Keys — Rotation Runbook

> If a key has been leaked (e.g. pasted in chat, committed to git, screenshotted in a public Slack), follow this immediately. The current leaked key is `rzp_live_SxWyxRusxeOBvq` — generate a new pair before continuing.

## 0. Background — what we have

| Secret | Where it lives | Used by |
| --- | --- | --- |
| `RAZORPAY_KEY_ID` (public) | Backend `.env` + mobile app `lib/config.dart` | Opening Checkout, calling Razorpay API |
| `RAZORPAY_KEY_SECRET` (private) | Backend `.env` **only** | Signing/verifying checkout signatures, calling Razorpay API |
| `RAZORPAY_WEBHOOK_SECRET` (private) | Backend `.env` **only** | Verifying webhook signatures |

Rule of thumb: **only `KEY_ID` ever touches the mobile app**. The secret never leaves the server.

## 1. Generate a new pair (zero-downtime)

1. Log into the Razorpay Dashboard → **Settings → API Keys**.
2. Click **Generate Key**. You'll get a new `key_id` and `key_secret`. Razorpay shows the secret **once** — copy it now.
3. **Do not** revoke the old key yet. Both will work simultaneously for a short overlap window.

## 2. Roll forward on the server

1. Add the new values to the **production** server's environment:
   ```
   RAZORPAY_KEY_ID=rzp_live_NEW...
   RAZORPAY_KEY_SECRET=<new secret>
   ```
   (Webhook secret is separate — see step 4.)
2. Restart the API process. The Razorpay client is a lazy singleton; a restart picks up the new env.
3. Sanity check: hit `POST /api/v1/bookings/order` with a test user. The response should include a real `orderId`.

## 3. Ship the new `key_id` to the mobile app

1. Update `lib/config.dart` with the new `KEY_ID` only.
2. Build, release, and let users update.
3. **Old app builds will keep using the old `key_id`** until they update — that's why we don't revoke immediately.

## 4. Rotate the webhook secret

1. In the Dashboard → **Settings → Webhooks**, edit the existing webhook URL (`https://api.stayfinderindia.net/api/v1/payments/razorpay/webhook`).
2. Set a new secret (or use "Regenerate"). Copy it.
3. Update on the server:
   ```
   RAZORPAY_WEBHOOK_SECRET=<new value>
   ```
4. Restart the API process.
5. In the Dashboard, send a **Test Webhook** for `payment.captured`. You should see `200 OK` in our logs and a row in `PaymentEvent`. A 400 means the secret on the server doesn't match the Dashboard.

## 5. Revoke the old `key_id`

Once 99%+ of installs are on the new app build (watch your analytics / version-distribution dashboard), go back to **Settings → API Keys** and **disable** the old key. From that moment any leftover old app build will fail to open Checkout and prompt for update.

## 6. Webhook rotation (no two-secret support)

Razorpay only supports **one webhook secret at a time**. To rotate without dropping events:

1. Temporarily set the server to accept either old or new during the swap. We don't currently support dual secrets in code; if you need this, add a fallback in [utils/signature.js](utils/signature.js)'s `verifyWebhookSignature` that tries the new secret first, then the old. Remove the fallback after 24h.
2. Or: accept a brief window of 400s on a few events and rely on the webhook retry policy (Razorpay retries failed deliveries). For most rotations this is fine.

## 7. After-action

- Add a calendar reminder for ~90 days from now to rotate again.
- Search the repo + Slack for any place the old secret was pasted. Delete it everywhere.
- If the leak was on a public channel, treat it as a confirmed compromise and review payments around the leak time for suspicious activity.

## Local development

For local dev, use **test mode** keys (`rzp_test_...`) — completely separate from live. Stick them in `.env` like:
```
RAZORPAY_KEY_ID=rzp_test_xxx
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
```
Set up a webhook in test mode that points at e.g. an ngrok URL of your laptop. Never use live keys for local testing.
