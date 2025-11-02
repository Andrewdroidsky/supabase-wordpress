# Issue #3: Missing `thankyou_page_url` Column in wp_user_registrations

**Type:** 🐛 Bug
**Severity:** 🟠 Medium
**Component:** Backend (supabase-bridge.php) + Database (Supabase SQL)
**Status:** ✅ Fixed (schema migration applied)

---

## 📝 Summary

PHP code in **supabase-bridge.php** tries to INSERT `thankyou_page_url` into `wp_user_registrations` table, but the column doesn't exist in the database schema, causing a 400 error.

---

## 🐛 Problem Description

### Symptoms:
- User authentication succeeds (JWT verified, WordPress cookie set)
- POST to `/wp-json/supabase-auth/callback` returns **HTTP 400**
- Supabase Dashboard → Logs shows error:
  ```
  Could not find the 'thankyou_page_url' column of 'wp_user_registrations'
  in the schema cache
  ```
- Browser console shows error during registration logging

### Root Cause:

**PHP code expects column that doesn't exist:**

```php
// supabase-bridge.php (around line 450)
$registration_data = [
    'user_id' => $supabase_user_id,
    'user_email' => $email,
    'registration_url' => $registration_url,
    'thankyou_page_url' => $thankyou_url,  // ← COLUMN DOESN'T EXIST!
    'pair_id' => $pair_id,
];

$response = $supabase->from('wp_user_registrations')->insert($registration_data);
```

**But Supabase table schema has:**

```sql
-- wp_user_registrations table (BEFORE fix)
CREATE TABLE wp_user_registrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  pair_id UUID REFERENCES wp_registration_pairs(id),
  user_email TEXT NOT NULL,
  registration_url TEXT,
  -- thankyou_page_url TEXT,  ← MISSING!
  registered_at TIMESTAMPTZ DEFAULT now()
);
```

**Why this happened:**
- SQL script `supabase-tables.sql` was created early in development
- PHP code was updated later to include `thankyou_page_url`
- Schema and code fell out of sync

---

## 🔍 Reproduction Steps

1. Setup WordPress + Supabase with plugin
2. Run `supabase-tables.sql` (original version without `thankyou_page_url`)
3. Configure plugin settings (URL, Anon Key, JWT Secret)
4. Login via Magic Link or OAuth
5. Check Supabase Dashboard → Logs

**Expected:**
- Registration logged successfully
- Row appears in `wp_user_registrations` table

**Actual:**
- HTTP 400 error
- Supabase Logs show: "Could not find the 'thankyou_page_url' column"
- Registration NOT logged (table remains empty)

---

## ✅ Solution

Add missing column to existing table via SQL migration:

### Migration SQL:

```sql
-- Add missing thankyou_page_url column
ALTER TABLE wp_user_registrations
ADD COLUMN IF NOT EXISTS thankyou_page_url TEXT;

-- Verify column was added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'wp_user_registrations'
ORDER BY ordinal_position;
```

**Run in:** Supabase Dashboard → SQL Editor → New Query → Run

### Expected Output:

```
Success. 0 rows returned
```

### Verification Query:

```sql
-- Should show thankyou_page_url in list
SELECT column_name FROM information_schema.columns
WHERE table_name = 'wp_user_registrations';
```

**Expected columns:**
```
id
user_id
pair_id
user_email
registration_url
thankyou_page_url  ← SHOULD BE HERE NOW
registered_at
```

---

## 🧪 Testing

### Test Case 1: New Registration
1. Run migration SQL
2. Clear WordPress session (logout)
3. Login via Magic Link
4. Check Supabase Dashboard → Table Editor → wp_user_registrations

**Expected:**
- New row appears
- `thankyou_page_url` column populated with URL
- No 400 errors in Logs

### Test Case 2: Existing Users
1. Login with existing user (created before fix)
2. Check `wp_user_registrations` table

**Expected:**
- New row created for this login session
- `thankyou_page_url` populated correctly

---

## 🎯 Impact

**Users affected:**
- 100% of installations using original `supabase-tables.sql`
- Anyone who installed before 2025-11-02

**Frequency:**
- 100% reproducible until migration applied

**Consequences:**
- User authentication still works (JWT verification succeeds)
- WordPress user created successfully
- BUT registration not logged in Supabase
- Webhooks won't trigger (no row in `wp_user_registrations`)
- Analytics data missing

**Workaround:**
- None needed - authentication still works
- Just apply migration to fix logging

---

## 📊 Related Issues

- Related to webhook system (webhook triggers depend on `wp_user_registrations` inserts)
- Related to #8 (logging existing users) - both affect registration tracking
- Documented in problems/07-missing-column.md

---

## 📚 Prevention

To prevent this in the future:

### 1. Schema Validation on Plugin Activation

Add to **supabase-bridge.php**:

```php
// On plugin activation, verify schema
function sb_verify_schema() {
    $required_columns = [
        'wp_user_registrations' => [
            'id', 'user_id', 'pair_id', 'user_email',
            'registration_url', 'thankyou_page_url', 'registered_at'
        ],
        'wp_registration_pairs' => [
            'id', 'registration_url', 'thankyou_page_url', 'created_at'
        ]
    ];

    foreach ($required_columns as $table => $columns) {
        $response = $supabase->from($table)->select('*')->limit(1);
        $actual_columns = array_keys($response->data[0] ?? []);

        $missing = array_diff($columns, $actual_columns);
        if (!empty($missing)) {
            add_action('admin_notices', function() use ($table, $missing) {
                echo '<div class="error"><p>';
                echo 'Supabase Bridge: Missing columns in ' . $table . ': ';
                echo implode(', ', $missing);
                echo '</p></div>';
            });
        }
    }
}

register_activation_hook(__FILE__, 'sb_verify_schema');
```

### 2. Migration Versioning

Track schema version in WordPress options:

```php
// Track schema version
$current_version = get_option('sb_schema_version', '0.0.0');
$required_version = '0.8.1';

if (version_compare($current_version, $required_version, '<')) {
    // Show migration notice
    add_action('admin_notices', function() {
        echo '<div class="error"><p>';
        echo 'Supabase Bridge: Please run schema migration to v0.8.1';
        echo ' (see documentation)';
        echo '</p></div>';
    });
}
```

### 3. Update supabase-tables.sql

Make sure **supabase-tables.sql** includes the column from the start:

```sql
-- wp_user_registrations table (CORRECT version)
CREATE TABLE IF NOT EXISTS wp_user_registrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  pair_id UUID REFERENCES wp_registration_pairs(id),
  user_email TEXT NOT NULL,
  registration_url TEXT,
  thankyou_page_url TEXT,  -- ✅ INCLUDE FROM START
  registered_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 🔧 Files Changed

### Migration Files:
- **Migration SQL** (new file):
  ```
  migrations/001-add-thankyou-column.sql
  ```

### Documentation Updated:
- **supabase-tables.sql** - added `thankyou_page_url` column
- **TROUBLESHOOTING.md** - added problem #6 with solution
- **SETUP.md** - updated Step 8 to mention migration

---

## ✅ Verification

**Check current schema:**
```sql
-- Run in Supabase SQL Editor
\d wp_user_registrations
```

**Expected output (AFTER migration):**
```
Column              | Type         | Nullable
--------------------|--------------|----------
id                  | UUID         | NOT NULL
user_id             | UUID         | NULL
pair_id             | UUID         | NULL
user_email          | TEXT         | NOT NULL
registration_url    | TEXT         | NULL
thankyou_page_url   | TEXT         | NULL  ← SHOULD BE HERE
registered_at       | TIMESTAMPTZ  | NULL
```

**Test INSERT:**
```sql
-- Should succeed without errors
INSERT INTO wp_user_registrations (
  user_id,
  user_email,
  registration_url,
  thankyou_page_url
) VALUES (
  'test-uuid-123',
  'test@example.com',
  '/login/',
  '/thank-you/'
);

-- Verify
SELECT * FROM wp_user_registrations
WHERE user_email = 'test@example.com';
```

---

## 💡 Lessons Learned

1. **Schema-Code Sync:** Always keep database schema and application code in sync
2. **Migration Strategy:** Use versioned migrations instead of ad-hoc ALTER TABLE
3. **Validation:** Add schema validation on plugin activation
4. **Testing:** Test full INSERT flow, not just SELECT queries
5. **Documentation:** Update SQL scripts immediately when code changes

---

## 🚀 Deployment Checklist

- [x] Migration SQL written
- [x] Tested in development
- [x] supabase-tables.sql updated
- [x] Documentation updated (TROUBLESHOOTING.md, SETUP.md)
- [x] Verification queries successful
- [ ] ⚠️ Added schema validation to plugin (recommended)
- [ ] ⚠️ Ready for production deployment

---

**Created:** 2025-11-02
**Last Updated:** 2025-11-02
**Estimated Fix Time:** ~10 minutes (once identified)
**Actual Debug Time:** ~25 minutes (finding root cause + verification)

---

**Priority for Plugin Author:** 🟠 **MEDIUM** - Breaks analytics/webhooks but not auth
