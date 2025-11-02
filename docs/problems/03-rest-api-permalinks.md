# Problem #3: REST API 404 (Permalinks Not Configured)

**Severity:** 🔴 HIGH
**Time to Debug:** ~10 minutes
**Time to Fix:** ~2 minutes
**Session:** 1 (2025-10-31)

---

## TL;DR

WordPress REST API requires "Post name" permalinks. Default "Plain" permalinks cause 404 errors for all REST endpoints.

---

## Symptoms

```
POST http://localhost:8000/wp-json/supabase-auth/callback 404 (Not Found)

Testing REST API:
http://localhost:8000/wp-json/
→ 404 Not Found
```

---

## Root Cause

**WordPress Permalinks Structure:**

| Setting | URL Format | REST API |
|---------|------------|----------|
| Plain | `?p=123` | ❌ 404 |
| Post name | `/sample-post/` | ✅ Works |
| Day and name | `/2025/11/02/sample-post/` | ✅ Works |
| Month and name | `/2025/11/sample-post/` | ✅ Works |

**Default:** Plain (no rewrite rules) → REST API broken

---

## Solution

**WordPress Admin → Settings → Permalinks:**

1. Select: **Post name**
2. Click: **Save Changes**

**This enables `.htaccess` rewrite rules:**
```apache
RewriteEngine On
RewriteRule ^wp-json/(.*)$ /index.php?rest_route=/$1 [QSA,L]
```

---

## Verification

```bash
# Test REST API root
curl http://localhost:8000/wp-json/

# Should return JSON (not 404):
{
  "name": "My Supa WP",
  "description": "Just another WordPress site",
  "routes": {
    "/wp-json/supabase-auth/callback": {...}
  }
}
```

---

## Prevention

**Add to plugin activation hook:**

```php
register_activation_hook(__FILE__, function() {
    $permalink_structure = get_option('permalink_structure');

    if (empty($permalink_structure)) {
        // Set to Post name if Plain
        update_option('permalink_structure', '/%postname%/');
        flush_rewrite_rules();

        add_action('admin_notices', function() {
            echo '<div class="notice notice-success"><p>';
            echo 'Supabase Bridge: Permalinks set to "Post name" (required for REST API)';
            echo '</p></div>';
        });
    }
});
```

---

## Related

- **Session:** [2025-10-31-session1.md](../sessions/2025-10-31-session1.md#0120---настройка-permalinks)
- **WordPress Docs:** [REST API Handbook](https://developer.wordpress.org/rest-api/)

---

**Lesson:** Always check permalinks when using REST API in WordPress!
