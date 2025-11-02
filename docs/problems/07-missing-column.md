# Problem #7: Missing thankyou_page_url Column

**Severity:** 🟠 MEDIUM
**Time to Debug:** ~25 minutes
**Time to Fix:** ~10 minutes
**Session:** 3 (2025-11-02)

---

## TL;DR

PHP code tried to INSERT `thankyou_page_url` into `wp_user_registrations`, but column didn't exist in database schema. Schema and code fell out of sync.

---

## Symptoms

```
Docker Logs:
PHP Warning: HTTP 400: Could not find the 'thankyou_page_url' column
of 'wp_user_registrations' in the schema cache

Supabase Logs:
POST /rest/v1/wp_user_registrations 400
Error: column "thankyou_page_url" does not exist
```

---

## Root Cause

**PHP code (supabase-bridge.php):**
```php
$registration_data = [
    'user_id' => $supabase_user_id,
    'user_email' => $email,
    'registration_url' => $registration_url,
    'thankyou_page_url' => $thankyou_url,  // ← Expects this column!
    'pair_id' => $pair_id,
];

$supabase->from('wp_user_registrations')->insert($registration_data);
```

**Database schema (supabase-tables.sql):**
```sql
CREATE TABLE wp_user_registrations (
  id UUID PRIMARY KEY,
  user_id UUID,
  user_email TEXT,
  registration_url TEXT,
  -- thankyou_page_url TEXT,  ← MISSING!
  registered_at TIMESTAMPTZ
);
```

**Why out of sync:**
- SQL script created early in development
- PHP code updated later
- No migration system

---

## Solution

### Migration SQL:

```sql
-- Add missing column
ALTER TABLE wp_user_registrations
ADD COLUMN IF NOT EXISTS thankyou_page_url TEXT;

-- Verify
SELECT column_name FROM information_schema.columns
WHERE table_name = 'wp_user_registrations';
```

**Run in:** Supabase Dashboard → SQL Editor

---

## Prevention

### 1. Schema Validation on Activation

```php
register_activation_hook(__FILE__, function() {
    $required_columns = ['thankyou_page_url', 'user_email', 'registration_url'];

    // Query Supabase table schema
    $response = $supabase->from('wp_user_registrations')->select('*')->limit(1);

    if (!empty($response->data)) {
        $actual_columns = array_keys((array)$response->data[0]);
        $missing = array_diff($required_columns, $actual_columns);

        if (!empty($missing)) {
            add_action('admin_notices', function() use ($missing) {
                echo '<div class="error"><p>';
                echo 'Missing columns: ' . implode(', ', $missing);
                echo ' (Run migration SQL)';
                echo '</p></div>';
            });
        }
    }
});
```

### 2. Update supabase-tables.sql

```sql
-- UPDATED VERSION (include from start)
CREATE TABLE wp_user_registrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  user_email TEXT NOT NULL,
  registration_url TEXT,
  thankyou_page_url TEXT,  -- ✅ Include from beginning
  pair_id UUID,
  registered_at TIMESTAMPTZ DEFAULT now()
);
```

### 3. Migration Versioning

```php
// Track schema version
update_option('sb_schema_version', '0.8.1');

if (version_compare(get_option('sb_schema_version', '0.0.0'), '0.8.1', '<')) {
    // Show migration prompt
}
```

---

## Testing

```sql
-- Test INSERT with new column
INSERT INTO wp_user_registrations (
  user_id, user_email, thankyou_page_url
) VALUES (
  'test-uuid', 'test@example.com', '/thank-you/'
);

-- Should succeed without errors
```

---

## Related

- **Issue:** [issue-03-missing-thankyou-column.md](../../issues/issue-03-missing-thankyou-column.md)
- **Session:** [2025-11-02-session3.md](../sessions/2025-11-02-session3.md#0125---новая-проблема-wp_user_registrations-empty)

---

**Lesson:** Always keep database schema and application code in sync!
