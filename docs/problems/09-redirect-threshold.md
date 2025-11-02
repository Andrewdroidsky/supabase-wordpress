# Problem #9: New User Threshold Too Short (60 sec → 24h)

**Severity:** 🟡 LOW (UX Issue)
**Time to Debug:** ~30 minutes
**Time to Fix:** ~5 minutes
**Session:** 3 (2025-11-02)

---

## TL;DR

`newUserThreshold` was 60 seconds, too short for Magic Link flow (~60-90 sec). Google OAuth users saw Thank You page, Magic Link users saw Blog.

---

## Symptoms

**Inconsistent redirects:**
- ✅ Google OAuth → Thank You page ("/registr/")
- ❌ Magic Link → Blog ("/")

**Same user, different auth methods, different redirects!**

---

## Root Cause

**auth-form.js:**

```javascript
const newUserThreshold = 60000; // 60 seconds

const createdAt = new Date(session.user.created_at).getTime();
const isNewUser = (Date.now() - createdAt) < newUserThreshold;

if (isNewUser && thankYouPageUrl) {
    window.location.href = thankYouPageUrl;  // Thank You
} else {
    window.location.href = '/';  // Blog
}
```

**Timeline comparison:**

| Flow | Time | Result |
|------|------|--------|
| Google OAuth | ~10 sec | < 60 sec → "new" → Thank You ✅ |
| Magic Link | ~60-90 sec | > 60 sec → "old" → Blog ❌ |

**Magic Link timeline:**
```
00:00 - Enter email
00:05 - Email sent
00:10 - Open email client
00:30 - Read email
00:45 - Click link
01:00 - Token processed
```

By the time user clicks (45-60 sec), threshold passed!

---

## Solution

```javascript
// FIXED: 60 sec → 24 hours
const newUserThreshold = 86400000; // 24 hours = 86400 seconds
```

**Why 24 hours:**
- Covers all realistic flows (Magic Link, OAuth, email delays)
- Allows users to complete registration at their own pace
- Industry standard (GitHub, Twitter, Slack show onboarding for 24h)

---

## Testing

```javascript
// Browser Console
const createdAt = new Date(session.user.created_at);
const now = new Date();
const diff = now - createdAt;

console.log('Created:', createdAt);
console.log('Now:', now);
console.log('Diff:', diff / 1000 / 60, 'minutes');
console.log('Is new:', diff < 86400000);  // Should be true within 24h
```

---

## Alternative Solutions Considered

### 1. Remove Threshold Entirely
**Pros:** Simple, always redirects to Thank You
**Cons:** If user logs out/in immediately, sees Thank You again (annoying)
**Verdict:** ❌ Rejected

### 2. Track "First Login" Flag
**Pros:** Most accurate (no time-based logic)
**Cons:** Requires database migration
**Verdict:** ⚠️ Future enhancement

### 3. Configurable Threshold
**Pros:** Admin can adjust based on analytics
**Cons:** Adds complexity
**Verdict:** ⚠️ Future enhancement

### 4. 24 Hours (Chosen)
**Pros:** Simple, covers all flows, industry standard
**Cons:** Arbitrary number
**Verdict:** ✅ Selected

---

## Future Enhancement

**Make threshold configurable:**

```php
// WordPress Settings
add_settings_field(
    'sb_new_user_threshold',
    'New User Threshold (hours)',
    'sb_threshold_callback',
    'supabase-bridge'
);

// Pass to JavaScript
wp_localize_script('supabase-auth-form', 'supabaseConfig', [
    'newUserThreshold' => get_option('sb_new_user_threshold', 24) * 3600000,
]);
```

---

## Related

- **Issue:** [issue-05-redirect-threshold.md](../../issues/issue-05-redirect-threshold.md)
- **Session:** [2025-11-02-session3.md](../sessions/2025-11-02-session3.md#0055---новая-проблема-redirect-на-blog-вместо-thank-you)

---

**Lesson:** Always consider real-world user behavior, not ideal scenarios!
