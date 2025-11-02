# Issue #2: Google OAuth Fails Due to sessionStorage Cross-Origin Limitation

**Type:** 🐛 Bug
**Severity:** 🔴 High
**Component:** Frontend (auth-form.js)
**Status:** ✅ Fixed (solution identified and tested)

---

## 📝 Summary

Google OAuth authentication fails because `sessionStorage` is cleared during cross-origin redirects (Google → WordPress), causing the callback handler to miss the authentication event.

---

## 🐛 Problem Description

### Symptoms:
- ✅ Magic Link authentication works perfectly
- ❌ Google OAuth authentication fails silently
- Browser console shows: `Token already processed, skipping`
- No POST request to `/wp-json/supabase-auth/callback` after Google redirect
- User redirects back from Google but remains unauthenticated

### Root Cause:

**auth-form.js** uses `sessionStorage` to track processed tokens:

```javascript
// BEFORE (BROKEN):
const processedKey = 'auth_tokens_processed';

// Check if already processed
const alreadyProcessed = sessionStorage.getItem(processedKey);
if (alreadyProcessed) {
  console.log('Token already processed, skipping');
  return;
}

// Mark as processed
sessionStorage.setItem(processedKey, 'true');
```

**The problem:**
- `sessionStorage` is scoped per origin
- Google OAuth flow: `localhost:8000` → `accounts.google.com` → `PROJECT.supabase.co` → `localhost:8000`
- When user returns to `localhost:8000` after cross-origin redirect, `sessionStorage` is cleared
- The `auth_tokens_processed` flag is lost
- BUT the browser cache still has the old page JavaScript running
- Result: Code thinks token is already processed when it's not

---

## 🔍 Reproduction Steps

1. Open login page: `http://localhost:8000/login/`
2. Click "Continue with Google"
3. Authorize Google account
4. Observe redirect back to WordPress
5. Check browser console (F12)

**Expected:**
- POST request to `/wp-json/supabase-auth/callback`
- User authenticated and redirected to Thank You page
- WordPress admin bar appears

**Actual:**
- Console shows: `Token already processed, skipping`
- No POST request sent
- User NOT authenticated
- No WordPress admin bar

---

## ✅ Solution

Replace `sessionStorage` with `localStorage` for OAuth flow persistence:

### Fix #1: Change storage mechanism

```javascript
// AFTER (FIXED):
const processedKey = 'auth_tokens_processed_v2';  // v2 to invalidate old sessionStorage

// Check if already processed
const alreadyProcessed = localStorage.getItem(processedKey);
if (alreadyProcessed) {
  console.log('Token already processed, skipping');
  return;
}

// Mark as processed
localStorage.setItem(processedKey, 'true');
```

**Why `localStorage`?**
- Persists across cross-origin redirects
- Survives page reloads
- Same origin policy still applies (secure)

### Fix #2: Auto-cleanup old tokens

Add automatic cleanup on page load to prevent `localStorage` accumulation:

```javascript
// Auto-cleanup on page load
window.addEventListener('DOMContentLoaded', () => {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours

  // Clean up old auth_tokens_processed flags
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('auth_tokens_processed')) {
      const timestamp = localStorage.getItem(key + '_timestamp');
      if (!timestamp || (now - parseInt(timestamp)) > maxAge) {
        localStorage.removeItem(key);
        localStorage.removeItem(key + '_timestamp');
      }
    }
  });
});

// When marking as processed, also save timestamp
localStorage.setItem(processedKey, 'true');
localStorage.setItem(processedKey + '_timestamp', Date.now().toString());
```

---

## 🧪 Testing

### Test Case 1: Google OAuth (Primary)
1. Clear `localStorage`: F12 → Console → `localStorage.clear()`
2. Navigate to login page
3. Click "Continue with Google"
4. Authorize Google account
5. **Expected:** User authenticated, redirected to Thank You page ✅

### Test Case 2: Magic Link (Regression)
1. Clear `localStorage`
2. Navigate to login page
3. Enter email, click "Continue with email"
4. Check email, click Magic Link
5. **Expected:** User authenticated, no regression ✅

### Test Case 3: Auto-cleanup
1. Manually set old token in `localStorage`:
   ```javascript
   localStorage.setItem('auth_tokens_processed_v2', 'true');
   localStorage.setItem('auth_tokens_processed_v2_timestamp', (Date.now() - 25*60*60*1000).toString()); // 25 hours ago
   ```
2. Reload page
3. Check `localStorage`
4. **Expected:** Old token removed automatically ✅

---

## 🎯 Impact

**Users affected:**
- Anyone using Google OAuth (or Facebook OAuth)
- Does NOT affect Magic Link users

**Frequency:**
- 100% reproducible for Google OAuth
- 0% for Magic Link

**Workaround:**
- Use Magic Link instead of Google OAuth
- Or use Incognito mode (fresh `sessionStorage` on each session)

---

## 📊 Related Issues

- Similar to #6 in problems/06-google-oauth-storage.md
- Related to OAuth redirect flow architecture (ARCHITECTURE.md lines 60-81)

---

## 📚 References

- **MDN Web Docs:** [Window.sessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage) - "sessionStorage is cleared when the page session ends"
- **Supabase Auth Docs:** [OAuth 2.0 Flow](https://supabase.com/docs/guides/auth/social-login)
- **WordPress REST API:** [Custom Endpoints](https://developer.wordpress.org/rest-api/extending-the-rest-api/adding-custom-endpoints/)

---

## 🔧 Files Changed

- **auth-form.js** (~27 lines changed)
  - Line ~45: `sessionStorage` → `localStorage` (5 occurrences)
  - Lines 15-35: Auto-cleanup logic added

---

## ✅ Verification

**Before fix:**
```bash
# Check auth-form.js for sessionStorage
grep -n "sessionStorage" auth-form.js
# Output: Line 45, 48, 52, 58, 61 (5 occurrences)
```

**After fix:**
```bash
# Check auth-form.js for localStorage
grep -n "localStorage" auth-form.js
# Output: Line 15-35 (cleanup), 45, 48, 52, 58, 61 (converted)

# Check for sessionStorage (should be 0)
grep -n "sessionStorage" auth-form.js
# Output: (none)
```

**Production test:**
- Google OAuth: ✅ WORKS (tested 2025-11-02)
- Magic Link: ✅ WORKS (no regression)
- Auto-cleanup: ✅ WORKS (24h threshold)

---

## 💡 Lessons Learned

1. **Cross-Origin Storage:** `sessionStorage` is NOT suitable for OAuth flows that involve cross-origin redirects.
2. **localStorage Accumulation:** Always implement auto-cleanup when using `localStorage` for temporary flags.
3. **Cache Busting:** WordPress caching can mask JavaScript changes. Use hard reload (Ctrl+Shift+R) or Incognito mode for testing.
4. **OAuth Testing:** Always test with REAL OAuth providers, not just local mocks.

---

## 🚀 Deployment Checklist

- [x] Code changes implemented
- [x] Tested in development (Docker)
- [x] Tested in Incognito mode
- [x] Tested with Google OAuth (real account)
- [x] Tested Magic Link (no regression)
- [x] Auto-cleanup verified
- [x] Documented in TROUBLESHOOTING.md
- [ ] ⚠️ Ready for production deployment

---

**Created:** 2025-11-02
**Last Updated:** 2025-11-02
**Estimated Fix Time:** ~25 minutes (once identified)
**Actual Debug Time:** ~70 minutes (finding root cause)

---

**Priority for Plugin Author:** 🔴 **HIGH** - Breaks critical OAuth functionality
