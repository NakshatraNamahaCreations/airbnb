# Flutter — Show Premium State in the App

Hand this to the Flutter dev. It's a focused brief covering only the subscription/premium-display work that's still missing from the app. The Razorpay payment flow itself is already specified in `FLUTTER_RAZORPAY_PROMPT.md` — this doc assumes that's been (or will be) implemented and concentrates on the **state-reading + UI display** half that's currently missing.

---

## 1. What you need to know in one paragraph

The backend now has a single endpoint — `GET /api/v1/subscriptions/me` — that returns the current user's subscription state. The app needs to call this in a few places, model it as a Dart class, and surface the user's status everywhere it matters (profile screen, subscription screen, premium-gated features). Critically: **subscriptions can now come from two sources** — either the user paid via Razorpay, or an admin granted them comp time. **The app should treat both identically**. The API response shape is the same regardless of source; the app must not branch on source.

Also: the local `SubscriptionStorage` becomes a read-through cache only. Never grant premium based on local storage alone after a cold start. Always re-fetch from `/subscriptions/me` on the relevant screens.

---

## 2. The endpoint

### `GET /api/v1/subscriptions/me`

| | |
|---|---|
| **Base URL** | `https://api.stayfinderindia.net/api/v1` (prod) · `http://localhost:9000/api/v1` (dev) |
| **Headers** | `Authorization: Bearer <user JWT>` |
| **Body** | — |
| **Auth** | required — returns `401` without a token |

### Response — three shapes, all `200`

**Active subscription (user is premium right now):**
```json
{
  "status": "active",
  "plan": "premium_monthly",
  "activeUntil": "2026-07-05T10:00:00.000Z"
}
```

**Expired subscription (user used to be premium, isn't now):**
```json
{
  "status": "expired",
  "plan": "premium_monthly",
  "activeUntil": "2026-05-01T10:00:00.000Z"
}
```

**Never subscribed:**
```json
{
  "status": "none",
  "plan": null,
  "activeUntil": null
}
```

That's the whole contract. There is no other field. The response is **identical** whether the subscription came from a Razorpay payment or from an admin grant — the app should not need (and will not get) a "source" or "grantedBy" field.

### Errors
- `401 { "code": "unauthorized" }` — token missing / expired → trigger app-level re-login flow.
- `403 { "code": "user_suspended" }` — the user account itself is suspended → log out, show "Account suspended" message.

---

## 3. Dart model

Suggested shape:

```dart
enum SubscriptionStatus { active, expired, none, unknown }

class SubscriptionState {
  final SubscriptionStatus status;
  final String? plan;
  final DateTime? activeUntil;
  final DateTime fetchedAt;

  const SubscriptionState({
    required this.status,
    required this.plan,
    required this.activeUntil,
    required this.fetchedAt,
  });

  bool get isActive => status == SubscriptionStatus.active &&
      activeUntil != null && activeUntil!.isAfter(DateTime.now());

  Duration? get remaining =>
      activeUntil == null ? null : activeUntil!.difference(DateTime.now());

  factory SubscriptionState.fromJson(Map<String, dynamic> json) {
    SubscriptionStatus parseStatus(String? s) {
      switch (s) {
        case 'active':  return SubscriptionStatus.active;
        case 'expired': return SubscriptionStatus.expired;
        case 'none':    return SubscriptionStatus.none;
        default:        return SubscriptionStatus.unknown;
      }
    }
    return SubscriptionState(
      status: parseStatus(json['status'] as String?),
      plan: json['plan'] as String?,
      activeUntil: json['activeUntil'] != null
          ? DateTime.parse(json['activeUntil'] as String)
          : null,
      fetchedAt: DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() => {
    'status': status.name,
    'plan': plan,
    'activeUntil': activeUntil?.toIso8601String(),
    'fetchedAt': fetchedAt.toIso8601String(),
  };
}
```

**Why `isActive` is a getter, not a stored bool:** the server sends `status: "active"` based on the moment it answered. If the device's clock has drifted or the response is cached, the local check `activeUntil.isAfter(DateTime.now())` is the truth that matters for unlocking UI in the next second.

---

## 4. API call (Dio/http example)

```dart
class SubscriptionApi {
  final Dio _dio; // pre-configured with base URL + auth interceptor

  SubscriptionApi(this._dio);

  Future<SubscriptionState> getMe() async {
    final res = await _dio.get('/subscriptions/me');
    if (res.statusCode != 200) {
      throw Exception('Failed to fetch subscription');
    }
    return SubscriptionState.fromJson(Map<String, dynamic>.from(res.data));
  }
}
```

---

## 5. State management — read-through cache

`SubscriptionStorage` (or whatever your local persistence is — Hive, SharedPreferences, secure_storage) is now a **cache**, not the source of truth.

```dart
class SubscriptionRepository {
  final SubscriptionApi _api;
  final SubscriptionStorage _cache;

  SubscriptionRepository(this._api, this._cache);

  /// Returns cached state immediately (or null), then refreshes from server
  /// and notifies via the supplied callback when fresh data arrives.
  Future<SubscriptionState?> readCached() => _cache.read();

  Future<SubscriptionState> refresh() async {
    final fresh = await _api.getMe();
    await _cache.write(fresh);
    return fresh;
  }

  /// Convenience: cache-first read, refresh in background.
  Stream<SubscriptionState> watch() async* {
    final cached = await _cache.read();
    if (cached != null) yield cached;
    try {
      final fresh = await _api.getMe();
      await _cache.write(fresh);
      yield fresh;
    } catch (_) {
      // swallow — if we have cache, we keep showing it
      if (cached == null) rethrow;
    }
  }

  Future<void> clear() => _cache.clear();
}
```

Drop `SubscriptionRepository` into your existing state container (Riverpod / Bloc / Provider / whatever you use). Riverpod sketch:

```dart
final subscriptionProvider = StateNotifierProvider<SubscriptionNotifier, AsyncValue<SubscriptionState>>(
  (ref) => SubscriptionNotifier(ref.read(subscriptionRepositoryProvider)),
);

class SubscriptionNotifier extends StateNotifier<AsyncValue<SubscriptionState>> {
  final SubscriptionRepository _repo;
  SubscriptionNotifier(this._repo) : super(const AsyncValue.loading()) {
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    final cached = await _repo.readCached();
    if (cached != null) state = AsyncValue.data(cached);
    try {
      final fresh = await _repo.refresh();
      state = AsyncValue.data(fresh);
    } catch (e, st) {
      if (state is! AsyncData) state = AsyncValue.error(e, st);
    }
  }

  Future<void> refresh() async {
    try {
      final fresh = await _repo.refresh();
      state = AsyncValue.data(fresh);
    } catch (e, st) {
      // keep last good value visible; surface error via toast if you want
    }
  }
}
```

---

## 6. When to call `/subscriptions/me`

| Trigger | Why |
|---|---|
| **App launch / splash** | Show fresh state by the time the user lands on home. |
| **After login (OTP verify / register success)** | The previous session's cached state belongs to the previous user. Clear cache + refresh. |
| **On Profile screen mount** | The screen shows "Premium until …" — must be current. |
| **On Subscription / Plans screen mount** | The user explicitly came here to check or buy; show real state. |
| **After successful `/subscriptions/verify`** | New purchase just succeeded — refresh immediately, don't wait for next cold start. |
| **Whenever a premium-gated feature is tapped** | Last-mile check, in case the user just expired between screen mount and tap. |
| **App resumed from background after > 5 minutes** | Soft refresh — catches admin-granted updates or expirations that happened while the app was suspended. |

> **Why the "app resume" trigger matters now:** an admin can grant or extend premium at any time. A user who was previously expired might be `active` 30 seconds later without any in-app action. The app needs to notice. Calling `/subscriptions/me` on resume covers this without polling.

---

## 7. UI — what to show where

### Profile screen header

```
┌──────────────────────────────────────┐
│  Ramesh K                            │
│  ramesh@x.com  ·  +91 98765 43210    │
│  ┌─────────────────────────────────┐ │
│  │ ⭐ Premium · until 5 Jul 2026   │ │
│  └─────────────────────────────────┘ │
└──────────────────────────────────────┘
```

- `status === 'active'`: golden/pink chip "Premium · until {activeUntil | dd MMM yyyy}".
- `status === 'expired'`: muted grey chip "Premium expired on {activeUntil | dd MMM yyyy}" + a "Renew" action.
- `status === 'none'`: subtle CTA "Get Premium" linking to the subscription screen.

### Subscription screen

When `status === 'active'`:
- Big "You're Premium" hero card.
- "Active until {activeUntil | full date}" — use a friendly format, e.g. `"5 July 2026, 3:30 PM"`.
- "Time remaining: 30 days" — computed from `activeUntil - now`, refresh on each screen mount.
- Hide the "Subscribe" CTA. Optionally show "Manage subscription" with the option to contact support.

When `status === 'expired'`:
- "Your Premium expired on …".
- Re-show the price (₹199 / 30 days) and a primary "Renew Premium" button → kicks off the order/checkout/verify flow.

When `status === 'none'`:
- Pricing card + primary CTA.

### Premium-gated features anywhere in the app

Wrap them in a guard that:
1. Reads the cached `SubscriptionState`.
2. If `isActive` is false **at the moment of tap**, navigate to the subscription screen instead of executing the action — don't even render the premium content.
3. If `isActive` is true, optimistically proceed AND fire a background `/subscriptions/me` to validate (so the next tap is correct if it just expired).

### Empty/loading states

- While the first `/subscriptions/me` call is in flight, show a skeleton chip — don't flash "Get Premium" if you don't have to. Cached state covers this for repeat opens.
- If the API call fails AND there's no cache, hide premium UI entirely (don't show "Get Premium" — that implies certainty you don't have). Surface a soft retry option.

---

## 8. Admin-granted subscriptions — important behavior note

A subscription can now arrive in the app **without the user ever having opened Razorpay Checkout**. This happens when:
- An admin grants a user comp time via the admin panel.
- An admin extends an active subscription (e.g. "+30 days" for a support apology).

From the app's perspective, this is **invisible**: `/subscriptions/me` just returns `status: "active"` with an `activeUntil` further in the future. The app should:
- ✅ Trust the API and unlock premium.
- ✅ Refresh on app resume so the user sees the new state without a restart.
- ❌ Not need any special "you got a gift" UI. (If you want a one-time celebration, the backend doesn't currently send a "newly granted" signal — talk to backend if you want one. Out of scope for now.)
- ❌ Not branch on `source` — that field is not returned to the app.

---

## 9. What to remove / change

If your current app does any of this — remove it:

- ❌ **A local boolean `isPremium` written from Razorpay's `EVENT_PAYMENT_SUCCESS` alone.** That callback is spoofable; only `/subscriptions/verify` 200 (or `/subscriptions/me` `active`) should unlock.
- ❌ **Using cached `SubscriptionStorage` as the source of truth after cold start.** Cache is read-fast, then re-verified.
- ❌ **A "tap to unlock premium" debug shortcut.** Delete it before release.
- ❌ **Polling `/subscriptions/me` on a timer.** Wasted requests. Use the triggers in §6 (app launch, screen mount, resume, post-verify, tap on gated feature). Polling at 1-min intervals or similar is overkill.
- ❌ **Computing "expired" based on `status` alone.** Always also check `activeUntil > now` — the device's clock vs server's clock can diverge briefly.

---

## 10. Quick end-to-end test cases

After you wire this up, smoke test:

1. **Cold start, never subscribed** → app calls `/subscriptions/me` → response `none` → no premium UI shown.
2. **Pay via Razorpay** → `/subscriptions/verify` returns `active` → app immediately refreshes `/subscriptions/me` (or uses the verify response directly) → profile shows "Premium · until …".
3. **Force kill app, reopen** → cached state shows premium instantly → background `/subscriptions/me` returns same → no flicker.
4. **Admin grants 30 days (from admin panel) while the app is in background** → user resumes app → app calls `/subscriptions/me` → `activeUntil` jumps forward → "Premium · until …" shows the new date with no app restart.
5. **Subscription expires while app is open** → user taps a gated feature → guard re-checks `isActive` (false) → navigates to subscription screen → "Renew" CTA shown.
6. **User logs out, logs in as a different user** → cache is cleared → `/subscriptions/me` called for the new user → their state shown, not the previous user's.

---

## 11. Pre-ship checklist

- [ ] `SubscriptionApi.getMe()` wired to `GET /subscriptions/me`.
- [ ] `SubscriptionState` model parses all three response shapes (`active`, `expired`, `none`).
- [ ] `SubscriptionRepository` does cache-first, refresh-in-background.
- [ ] `/subscriptions/me` is called on: app launch, post-login, profile mount, subscription screen mount, post-verify, app resume (>5min), premium-feature tap.
- [ ] Profile screen shows the "Premium · until …" chip for active subs.
- [ ] Subscription screen shows the right state (hero / renew / subscribe).
- [ ] Premium-gated features check `isActive` at tap time, not just at mount.
- [ ] Cache is cleared on logout.
- [ ] No code path grants premium based on local boolean alone.
- [ ] Admin-granted scenario verified end-to-end (have someone grant via the admin panel while the app is in background, then resume).

---

## 12. API summary — for quick reference

```http
GET /api/v1/subscriptions/me
Host: api.stayfinderindia.net
Authorization: Bearer <user JWT>
Accept: application/json
```

Response (one of):
```json
{ "status": "active",  "plan": "premium_monthly", "activeUntil": "2026-07-05T10:00:00.000Z" }
{ "status": "expired", "plan": "premium_monthly", "activeUntil": "2026-05-01T10:00:00.000Z" }
{ "status": "none",    "plan": null, "activeUntil": null }
```

That's the entire surface. Nothing else to integrate for the display half. The payment half is the separate flow you already have specced.

— Backend team
