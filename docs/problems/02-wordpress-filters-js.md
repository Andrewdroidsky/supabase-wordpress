# Problem #2: WordPress Filters Breaking JavaScript

**Severity:** 🟡 MEDIUM
**Time to Debug:** ~40 minutes
**Time to Fix:** ~30 minutes
**Session:** 2 (2025-11-01)

---

## TL;DR

WordPress `wptexturize` filter converted `&&` to `&#038;&#038;` in inline JavaScript, causing syntax errors. Solution: Move JavaScript to separate file.

---

## Symptoms

```
Browser Console:
Uncaught SyntaxError: Invalid or unexpected token
at auth-form.html:1052

View Source:
if (session &#038;&#038; session.user) {
            ^
```

---

## Root Cause

**WordPress applies content filters to ALL content:**

```php
// Shortcode returned HTML + JavaScript
function sb_auth_form_shortcode() {
    return '<div>...</div><script>
    if (session && session.user) { ... }  // ← WordPress corrupts this!
    </script>';
}
```

**Filters applied:**
- `wptexturize` - Smart quotes, `&&` → `&#038;&#038;`
- `wpautop` - Auto paragraphs
- `convert_chars` - Character conversion

**Result:** Invalid JavaScript syntax

---

## Solution

**NEVER embed JavaScript in content!**

```php
// BEFORE (BROKEN): Inline JavaScript
function sb_auth_form_shortcode() {
    return '<div>...</div><script>...</script>';
}

// AFTER (FIXED): External file
function sb_auth_form_shortcode() {
    wp_enqueue_script(
        'supabase-auth-form',
        plugins_url('auth-form.js', __FILE__),
        ['supabase-js'],
        filemtime(plugin_dir_path(__FILE__) . 'auth-form.js'),  // Cache bust
        true
    );

    wp_localize_script('supabase-auth-form', 'supabaseConfig', [
        'url' => sb_cfg('URL'),
        'anonKey' => sb_cfg('ANON_KEY'),
    ]);

    return '<div>...</div>';  // HTML only!
}
```

**Created:** `auth-form.js` (~200 lines)

---

## Verification

```html
<!-- View Source should show: -->
<script src="/wp-content/plugins/supabase-bridge/auth-form.js?ver=1699012345"></script>

<!-- NOT inline JavaScript! -->
```

---

## Best Practices

1. **ALWAYS** use `wp_enqueue_script()` for JavaScript
2. **NEVER** embed `<script>` in shortcode output
3. **USE** `wp_localize_script()` for passing PHP data to JS
4. **IMPLEMENT** cache busting with `filemtime()`

---

## Related

- **Session:** [2025-11-01-session2.md](../sessions/2025-11-01-session2.md#0150---тест-после-csp-fix-still-failed)
- **WordPress Docs:** [Plugin Handbook - JavaScript](https://developer.wordpress.org/plugins/javascript/)

---

**Lesson:** WordPress is a CMS - it transforms content. Keep JavaScript separate!
