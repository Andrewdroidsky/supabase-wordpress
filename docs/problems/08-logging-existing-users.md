# Problem #8: Logging Only for New Users

**Severity:** 🟡 LOW
**Time to Debug:** ~15 minutes
**Time to Fix:** ~10 minutes
**Session:** 3 (2025-11-02)

---

## TL;DR

Registration logging function was placed inside `if (!$user)` block, so it only executed for NEW WordPress users. Existing users logging in again were not tracked.

---

## Symptoms

```sql
-- First login (new user)
SELECT * FROM wp_user_registrations WHERE user_email = 'test@example.com';
-- Returns: 1 row ✅

-- Second login (same user)
SELECT * FROM wp_user_registrations WHERE user_email = 'test@example.com';
-- Returns: 1 row (NO NEW ROW!) ❌
```

---

## Root Cause

**Code structure (BROKEN):**

```php
function sb_handle_auth_callback($request) {
    $user = sb_find_user_by_supabase_id($supabase_user_id);

    if (!$user) {
        // User doesn't exist - create new
        $user_id = wp_create_user(...);

        // ⚠️ LOGGING HERE - ONLY FOR NEW USERS!
        sb_log_user_registration([...]);
    }

    // If user exists, NO logging!

    wp_set_auth_cookie($user->ID);
}
```

**Why:** Logging function inside `if (!$user)` block

---

## Solution

**Move logging OUTSIDE if block:**

```php
function sb_handle_auth_callback($request) {
    $user = sb_find_user_by_supabase_id($supabase_user_id);

    if (!$user) {
        $user_id = wp_create_user(...);
        update_user_meta($user_id, 'supabase_user_id', $supabase_user_id);
    }

    // ✅ MOVED OUTSIDE - LOGS EVERY LOGIN!
    sb_log_user_registration([
        'user_id' => $supabase_user_id,
        'user_email' => $email,
        'registration_url' => $registration_url,
        'thankyou_page_url' => $thankyou_url,
    ]);

    wp_set_auth_cookie($user->ID);
}
```

**Result:** Every login creates new `wp_user_registrations` row

---

## Impact

**Before fix:**
- Only first registration tracked
- Incomplete analytics (no login history)
- Webhooks only trigger once

**After fix:**
- Every login tracked
- Complete user activity history
- Webhooks trigger on every login

---

## Optional: Deduplication

**Prevent duplicate logs for rapid logins:**

```php
function sb_log_user_login($data) {
    // Check if logged within last 5 minutes
    $recent = $supabase->from('wp_user_registrations')
        ->select('registered_at')
        ->eq('user_id', $data['user_id'])
        ->order('registered_at', ['ascending' => false])
        ->limit(1);

    if (!empty($recent->data)) {
        $last_login = strtotime($recent->data[0]['registered_at']);
        if ((time() - $last_login) < 300) {  // 5 min
            return;  // Skip duplicate
        }
    }

    // Log the login
    $supabase->from('wp_user_registrations')->insert($data);
}
```

---

## Analytics Query

```sql
-- Login count per user
SELECT
  user_email,
  COUNT(*) as login_count,
  MAX(registered_at) as last_login,
  MIN(registered_at) as first_registration
FROM wp_user_registrations
GROUP BY user_email
ORDER BY login_count DESC;
```

---

## Related

- **Issue:** [issue-04-logging-all-logins.md](../../issues/issue-04-logging-all-logins.md)
- **Session:** [2025-11-02-session3.md](../sessions/2025-11-02-session3.md#0155---диагностика-logging-только-для-новых)

---

**Lesson:** Function name was `sb_log_user_registration()` but should be `sb_log_user_login()` - semantic naming matters!
