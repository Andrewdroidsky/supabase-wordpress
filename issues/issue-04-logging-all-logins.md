# Issue #4: Registration Logging Only Works for New Users

**Type:** 🐛 Bug
**Severity:** 🟡 Low
**Component:** Backend (supabase-bridge.php)
**Status:** ✅ Fixed (code refactored)

---

## 📝 Summary

Registration logging function `sb_log_user_registration()` was placed inside the `if (!$user)` block, causing it to execute ONLY for new WordPress users. Existing users who login again are not logged in `wp_user_registrations` table.

---

## 🐛 Problem Description

### Symptoms:
- New user registers via Google OAuth → logged in `wp_user_registrations` ✅
- Same user logs in again → NOT logged in `wp_user_registrations` ❌
- Table `wp_user_registrations` remains empty for repeat logins
- Analytics incomplete (only shows first registration, not subsequent logins)

### Root Cause:

**Original code structure (BROKEN):**

```php
// supabase-bridge.php (around line 380-420)
function sb_handle_auth_callback($request) {
    // ... JWT verification ...

    // Find or create WordPress user
    $user = sb_find_user_by_supabase_id($supabase_user_id);

    if (!$user) {
        // User doesn't exist - create new WordPress user
        $user_id = wp_create_user($username, wp_generate_password(), $email);
        $user = get_user_by('ID', $user_id);

        update_user_meta($user_id, 'supabase_user_id', $supabase_user_id);

        // ⚠️ LOGGING HAPPENS HERE - ONLY FOR NEW USERS!
        sb_log_user_registration([
            'user_id' => $supabase_user_id,
            'user_email' => $email,
            'registration_url' => $registration_url,
            'thankyou_page_url' => $thankyou_url,
        ]);
    }

    // If user exists, logging is SKIPPED!

    // Set WordPress cookie
    wp_set_auth_cookie($user->ID);

    return new WP_REST_Response(['redirect_url' => $redirect_url]);
}
```

**Why this is wrong:**
- WordPress user is created only ONCE
- Subsequent logins find existing user (`$user` is NOT null)
- Logging function inside `if (!$user)` block never executes again
- Result: Only first registration logged, repeat logins ignored

---

## 🔍 Reproduction Steps

1. Register new user via Google OAuth
2. Check `wp_user_registrations` table → ✅ Row exists
3. Logout from WordPress
4. Login again with same Google account
5. Check `wp_user_registrations` table → ❌ No new row

**Expected:**
- Every login creates a new row in `wp_user_registrations`
- Table shows login history, not just first registration

**Actual:**
- Only first registration creates row
- Subsequent logins don't create rows

---

## ✅ Solution

Move logging function OUTSIDE the `if (!$user)` block:

### Fixed Code:

```php
// supabase-bridge.php (FIXED)
function sb_handle_auth_callback($request) {
    // ... JWT verification ...

    // Find or create WordPress user
    $user = sb_find_user_by_supabase_id($supabase_user_id);

    if (!$user) {
        // User doesn't exist - create new WordPress user
        $user_id = wp_create_user($username, wp_generate_password(), $email);
        $user = get_user_by('ID', $user_id);

        update_user_meta($user_id, 'supabase_user_id', $supabase_user_id);
    }

    // ✅ MOVED OUTSIDE if (!$user) - LOGS EVERY LOGIN!
    sb_log_user_registration([
        'user_id' => $supabase_user_id,
        'user_email' => $email,
        'registration_url' => $registration_url,
        'thankyou_page_url' => $thankyou_url,
    ]);

    // Set WordPress cookie
    wp_set_auth_cookie($user->ID);

    return new WP_REST_Response(['redirect_url' => $redirect_url]);
}
```

**Result:**
- `sb_log_user_registration()` executes EVERY time callback runs
- Both new and existing users get logged
- Complete login history in `wp_user_registrations`

---

## 🧪 Testing

### Test Case 1: New User (Should Still Work)
1. Clear WordPress users (or use new email)
2. Login via Magic Link
3. Check `wp_user_registrations`

**Expected:**
- ✅ New row created
- Columns populated correctly

### Test Case 2: Existing User (Primary Fix)
1. Use email from Test Case 1
2. Logout from WordPress
3. Login again via Magic Link
4. Check `wp_user_registrations`

**Expected:**
- ✅ New row created with current timestamp
- `user_id` matches existing Supabase user
- `registered_at` shows current login time

### Test Case 3: Multiple Logins
1. Login/logout 5 times with same user
2. Query `wp_user_registrations`:
   ```sql
   SELECT user_email, registered_at
   FROM wp_user_registrations
   WHERE user_email = 'test@example.com'
   ORDER BY registered_at DESC;
   ```

**Expected:**
- ✅ 5 rows (or more if tested previously)
- Timestamps show each login attempt

---

## 🎯 Impact

**Users affected:**
- Anyone who logs in more than once
- 100% of repeat users

**Frequency:**
- 100% reproducible for existing users

**Consequences:**
- Incomplete analytics (only first registration tracked)
- Webhooks only trigger for new users (not repeat logins)
- Cannot track user activity over time
- Cannot detect inactive users (last_login not tracked)

**Severity:**
- 🟡 LOW for authentication (auth still works)
- 🟠 MEDIUM for analytics (data incomplete)
- 🔴 HIGH for webhook automation (events missed)

---

## 📊 Related Issues

- Related to webhook system (triggers depend on `wp_user_registrations` inserts)
- Related to #3 (missing column) - both affect registration logging
- Documented in problems/08-logging-existing-users.md

---

## 🔧 Files Changed

- **supabase-bridge.php** (~10 lines moved)
  - Line ~420: Moved `sb_log_user_registration()` call outside `if (!$user)` block

---

## ✅ Verification

**Test in development:**
```bash
# Watch WordPress logs
docker compose logs wordpress --follow | grep "Registration logged"

# Login via browser
# Should see in logs:
# "Registration logged for user_id: xxx"
```

**Check database:**
```sql
-- Count logins per user
SELECT
  user_email,
  COUNT(*) as login_count,
  MAX(registered_at) as last_login,
  MIN(registered_at) as first_registration
FROM wp_user_registrations
GROUP BY user_email
ORDER BY login_count DESC;
```

**Expected for test user:**
```
user_email         | login_count | last_login           | first_registration
-------------------|-------------|----------------------|-------------------
test@example.com   | 5           | 2025-11-02 14:30:00  | 2025-11-02 12:00:00
```

---

## 💡 Lessons Learned

1. **Semantic Naming:** Function name is `sb_log_user_registration()` but should be `sb_log_user_login()` (more accurate)
2. **Scope Awareness:** Always check WHERE function is called, not just WHAT it does
3. **Testing Coverage:** Test both new AND existing user flows
4. **Database Monitoring:** Check actual data, not just code logic

---

## 🚀 Recommended Enhancements

### Option 1: Rename Function (Semantic Clarity)

```php
// BEFORE
function sb_log_user_registration($data) { ... }

// AFTER
function sb_log_user_login($data) { ... }  // More accurate name
```

### Option 2: Deduplicate Recent Logins

Prevent duplicate logs if user logs in multiple times rapidly (e.g., browser refresh):

```php
function sb_log_user_login($data) {
    // Check if user logged in recently (within 5 minutes)
    $recent_threshold = 5 * 60; // 5 minutes in seconds

    $response = $supabase->from('wp_user_registrations')
        ->select('registered_at')
        ->eq('user_id', $data['user_id'])
        ->order('registered_at', ['ascending' => false])
        ->limit(1);

    if (!empty($response->data)) {
        $last_login = strtotime($response->data[0]['registered_at']);
        $now = time();

        if (($now - $last_login) < $recent_threshold) {
            // Skip logging if logged in within last 5 minutes
            error_log("Supabase Bridge: Skipping duplicate login log (within 5 min)");
            return;
        }
    }

    // Log the login
    $supabase->from('wp_user_registrations')->insert($data);
}
```

### Option 3: Add `login_type` Column

Distinguish between registrations and logins:

```sql
-- Migration
ALTER TABLE wp_user_registrations
ADD COLUMN login_type TEXT DEFAULT 'login';

-- Update existing rows
UPDATE wp_user_registrations
SET login_type = 'registration'
WHERE registered_at = (
    SELECT MIN(registered_at)
    FROM wp_user_registrations AS wr2
    WHERE wr2.user_id = wp_user_registrations.user_id
);
```

---

## 🚀 Deployment Checklist

- [x] Code refactored (function moved outside if block)
- [x] Tested with new user (no regression)
- [x] Tested with existing user (fix verified)
- [x] Tested multiple logins (data accumulates)
- [x] Documented in TROUBLESHOOTING.md
- [ ] ⚠️ Consider deduplication logic (optional)
- [ ] ⚠️ Consider renaming function (optional)
- [ ] ⚠️ Ready for production deployment

---

**Created:** 2025-11-02
**Last Updated:** 2025-11-02
**Estimated Fix Time:** ~5 minutes (once identified)
**Actual Debug Time:** ~15 minutes (finding + verification)

---

**Priority for Plugin Author:** 🟡 **LOW-MEDIUM** - Auth works, but analytics incomplete
