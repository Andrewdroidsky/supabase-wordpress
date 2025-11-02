# Problem #1: CSP Blocking Web Workers

**Severity:** 🟠 MEDIUM
**Time to Debug:** ~25 minutes
**Time to Fix:** ~15 minutes
**Session:** 2 (2025-11-01)

---

## TL;DR

Supabase JS SDK uses Web Workers for crypto operations, but WordPress default CSP headers blocked `blob:` sources, causing authentication to fail.

---

## Symptoms

```
Browser Console:
Refused to create a worker from 'blob:http://localhost:8000/...'
because it violates the following Content Security Policy directive:
"worker-src 'self'"
```

---

## Root Cause

**Supabase JS SDK architecture:**
- Uses Web Workers for crypto (JWT signing, encryption)
- Workers created from `blob:` URLs (inline code)
- CSP default: `worker-src 'self'` (no `blob:`)

**Result:** Workers blocked → Auth fails

---

## Solution

```php
// supabase-bridge.php
function sb_add_csp_headers() {
    if (!is_page() && !is_single()) {
        return;  // Only on pages with auth form
    }

    header("Content-Security-Policy: script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net blob:; worker-src 'self' blob:;");
}
add_action('send_headers', 'sb_add_csp_headers');
```

**Key additions:**
- `script-src blob:` - Allow inline workers
- `worker-src blob:` - Allow blob-based workers

---

## Verification

```bash
curl -I http://localhost:8000/login/ | grep -i "content-security"
```

**Expected:**
```
Content-Security-Policy: script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net blob:; worker-src 'self' blob:
```

---

## Related

- **Session:** [2025-11-01-session2.md](../sessions/2025-11-01-session2.md#0135---новая-проблема-csp-headers)
- **Supabase Docs:** [CSP for Auth](https://supabase.com/docs/guides/auth/auth-helpers/nextjs#content-security-policy)

---

**Lesson:** Modern JS libraries often use Web Workers - always allow `blob:` in CSP!
