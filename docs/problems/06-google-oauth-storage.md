# Problem #6: Google OAuth sessionStorage Cross-Origin Issue

**Severity:** 🔴 HIGH
**Time to Debug:** ~70 minutes
**Time to Fix:** ~15 minutes
**Session:** 3 (2025-11-02)

---

## TL;DR

Google OAuth failed because `sessionStorage` is cleared during cross-origin redirects (Google → Supabase → WordPress). Switching to `localStorage` with auto-cleanup fixed the issue.

---

## Symptoms

- ✅ Magic Link works
- ❌ Google OAuth fails silently
- Console: `Token already processed, skipping`
- No POST to `/wp-json/supabase-auth/callback`

---

## Root Cause

```javascript
// auth-form.js used sessionStorage
const processedKey = 'auth_tokens_processed';

// Check if already processed
if (sessionStorage.getItem(processedKey)) {
  return;  // ← Exit early, token not sent to backend!
}

sessionStorage.setItem(processedKey, 'true');
```

**OAuth Flow:**
```
localhost:8000 → accounts.google.com → PROJECT.supabase.co → localhost:8000
```

**Problem:**
- `sessionStorage` scoped per origin
- Cleared when navigating away from `localhost:8000`
- Browser cache keeps old JavaScript
- Code thinks token already processed (stale cache)

---

## Solution

```javascript
// FIXED: sessionStorage → localStorage
const processedKey = 'auth_tokens_processed_v2';

if (localStorage.getItem(processedKey)) {
  return;
}

localStorage.setItem(processedKey, 'true');
localStorage.setItem(processedKey + '_timestamp', Date.now().toString());
```

**Auto-cleanup (prevent accumulation):**

```javascript
window.addEventListener('DOMContentLoaded', () => {
  const maxAge = 24 * 60 * 60 * 1000; // 24h
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('auth_tokens_processed')) {
      const timestamp = localStorage.getItem(key + '_timestamp');
      if (!timestamp || (Date.now() - parseInt(timestamp)) > maxAge) {
        localStorage.removeItem(key);
        localStorage.removeItem(key + '_timestamp');
      }
    }
  });
});
```

---

## Why localStorage Works

| Storage Type | Cross-Origin | Persistence | Use Case |
|-------------|--------------|-------------|----------|
| sessionStorage | ❌ Cleared | Session only | Single-page flows |
| localStorage | ✅ Persists | Until cleared | Multi-origin flows |

**OAuth requires localStorage because:**
- Multiple origin redirects
- Need to track state across redirects
- Auto-cleanup prevents bloat

---

## Testing

1. Clear localStorage: `localStorage.clear()`
2. Click "Continue with Google"
3. Authorize
4. Check console: Should see POST to `/callback`
5. Check localStorage: `auth_tokens_processed_v2` present

**After 24h:** Auto-cleanup removes old flags

---

## Related

- **Issue:** [issue-02-google-oauth-storage.md](../../issues/issue-02-google-oauth-storage.md)
- **Session:** [2025-11-02-session3.md](../sessions/2025-11-02-session3.md#0010---диагностика-sessionstorage-vs-localstorage)

---

**Lesson:** Always use `localStorage` for OAuth flows + implement auto-cleanup!
