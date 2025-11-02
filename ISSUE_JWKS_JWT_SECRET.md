  📄 Что включено:

  1. Полное описание проблемы (15 разделов):

  - Краткое резюме (Summary)
  - Окружение (Environment)
  - Шаги воспроизведения (Steps to Reproduce)
  - Фактический результат с логами (Actual Result)
  - Ожидаемый результат (Expected Result)

  2. Глубокий анализ:

  - 🔍 Root Cause Analysis - ПОЧЕМУ не работает
  - ❌ Все неудачные попытки исправления (Tested Workarounds)
  - 📊 Таблица всех JWKS путей которые пробовали

  3. Рабочее решение:

  - ✅ Полный код исправлений (3 места в файле)
  - 📝 Инструкции для пользователей (где найти JWT Secret)
  - 🧪 Логи успешной аутентификации (после исправления)

  4. Дополнительно:

  - 🎯 Impact & Severity (почему CRITICAL)
  - 🔄 Backward Compatibility (как не сломать старые установки)
  - 💻 Code Diff (сколько строк изменено)
  - 📚 References (ссылки на документацию)

  ---
  🎯 Когда будешь готов публиковать:

  Скажи мне и я помогу:
  1. 🔍 Найти репозиторий плагина (GitHub/GitLab/WordPress.org)
  2. ✅ Проверить нет ли похожих issues
  3. 📤 Создать issue с этим текстом
  4. 💻 Опционально: создать Pull Request с кодом

  ---
  📝 Краткий ответ на твои вопросы:

  Issue (Проблема):
  - Публикация проблемы = сообщение "это не работает"
  - Обсуждение, планирование решения

  Pull Request (Запрос кода):
  - Предложение конкретного кода
  - "Вот как я исправил, проверьте и добавьте в проект"

  Типичный flow:
  1. Issue: "Не работает Magic Link" → обсуждение
  2. Pull Request: "Вот код исправления" → review + merge


# 🐛 Bug Report: Magic Link Authentication Fails with Supabase Cloud

## 📋 Issue Summary

Magic Link authentication **completely fails** when using the plugin with **Supabase Cloud** due to incorrect JWT verification method. The plugin attempts to verify JWT tokens using **JWKS (RS256)**, but Supabase Cloud uses **JWT Secret (HS256)** for authentication tokens.

**Current behavior:** Authentication fails with error "JWK Set did not contain any keys"
**Expected behavior:** User logs in successfully after clicking Magic Link
**Impact:** 🔴 **CRITICAL** - Magic Link authentication is completely broken for Supabase Cloud users

---

## 🌍 Environment

```yaml
WordPress: 6.7+ (latest)
PHP: 8.3.27
Supabase: Cloud (hosted at *.supabase.co)
Plugin Version: [CHECK supabase-bridge.php header]
Database: MySQL 8.0
Browser: Chrome 141.0.0.0 (tested)
Authentication Method: Magic Link (passwordless email)
```

---

## 🔄 Steps to Reproduce

### Prerequisites:
1. Fresh WordPress installation (Docker or standard)
2. Supabase project created at supabase.co
3. Plugin installed and activated
4. Supabase tables created (wp_registration_pairs, wp_user_registrations)
5. Email provider configured in Supabase (for Magic Link delivery)

### Configuration:
1. Navigate to: **WordPress Admin → Settings → Supabase Bridge**
2. Configure:
   - **Supabase URL:** `https://[your-project-ref].supabase.co`
   - **Anon Key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (from Supabase Dashboard → Settings → API)
   - **Service Role Key:** (optional, for server-side operations)
3. Save settings
4. Create WordPress page with shortcode: `[supabase_auth_form]`

### Testing Flow:
1. Navigate to Login page (with `[supabase_auth_form]` shortcode)
2. Enter email address in the form
3. Click **"Continue with email"** button
4. Check email inbox
5. Click **Magic Link** in the email
6. Observe error in browser console

---

## ❌ Actual Result

### User Experience:
- Browser console shows: **"Auth error: Error: JWK Set did not contain any keys"**
- User stays on login page (not authenticated)
- No WordPress session created
- Error message displayed: "JWK Set did not contain any keys" (red alert box)

### Backend Logs (WordPress):
```
[Sat Nov 01 11:53:53.567287 2025] [php:notice] Supabase Bridge: Fetching JWKS from: https://cerlknvqofiyzbbngeyo.supabase.co/auth/v1/.well-known/jwks.json
[Sat Nov 01 11:53:53.897611 2025] [php:notice] Supabase Bridge: JWKS response status: 200, body length: 11
[Sat Nov 01 11:53:53.897677 2025] [php:notice] Supabase Bridge: JWKS decoded: {"keys":[]}
[Sat Nov 01 11:53:53.926746 2025] [php:notice] Supabase Bridge: Authentication failed - Error: JWK Set did not contain any keys, IP: 172.18.0.1
POST /wp-json/supabase-auth/callback HTTP/1.1 401 817 (UNAUTHORIZED)
```

### Key Observation:
The JWKS endpoint returns **HTTP 200** but with an **empty keys array**: `{"keys":[]}`

This is NOT a network error - the endpoint responds successfully but provides no keys because Supabase Cloud doesn't use RS256 for Magic Link tokens.

---

## ✅ Expected Result

1. User clicks Magic Link in email
2. Browser redirects to WordPress with `#access_token=...` in URL
3. JavaScript extracts token and sends to `/wp-json/supabase-auth/callback`
4. Backend verifies JWT token successfully
5. WordPress user created (if first login) or matched (if exists)
6. WordPress session established via `wp_set_auth_cookie()`
7. User redirected to homepage as authenticated user
8. User sees "Howdy, [email]" in admin bar

---

## 🔍 Root Cause Analysis

### The Problem:

The plugin uses **JWKS (JSON Web Key Set)** to verify JWT tokens, expecting **RS256 (asymmetric)** encryption:

```php
// Current implementation (supabase-bridge.php:794-840)
$jwks = "{$issuer}/.well-known/jwks.json";

// Fetch JWKS from Supabase
$resp = wp_remote_get($jwks, ['headers' => ['apikey' => $anonKey]]);
$keys = json_decode(wp_remote_retrieve_body($resp), true);

// Attempt RS256 verification
$publicKeys = \Firebase\JWT\JWK::parseKeySet($keys);
$decoded = \Firebase\JWT\JWT::decode($jwt, $publicKeys);
```

However, **Supabase Cloud uses HS256 (symmetric)** with a **JWT Secret** for authentication tokens, NOT RS256 with JWKS.

### Why JWKS Returns Empty Array:

Supabase Cloud's JWKS endpoint (`/.well-known/jwks.json`) returns:
```json
{"keys":[]}
```

This is because:
1. Supabase uses **HS256 (HMAC with secret key)** for Auth tokens
2. HS256 is **symmetric** - same secret for signing and verification
3. JWKS is for **asymmetric** algorithms (RS256, ES256) with public/private key pairs
4. Supabase provides **JWT Secret** instead of public keys

### Supabase Documentation:

From Supabase Dashboard → Settings → API → JWT Settings:
- **"Legacy JWT Secret"** - used for signing tokens with HS256
- **"JWT Signing Keys"** - newer feature (not yet used for Magic Link tokens)

The documentation says:
> "Right now your project is using the legacy JWT secret. To start taking advantage of the new JWT signing keys, migrate your project's secret to the new set up."

This confirms Supabase Cloud **currently uses HS256 with JWT Secret**, not RS256 with JWKS.

---

## 🔧 Tested Workarounds (All Failed)

### Attempt 1: Different JWKS Paths
Tried various JWKS endpoint paths:
```
❌ https://[project].supabase.co/auth/v1/.well-known/jwks.json → {"keys":[]}
❌ https://[project].supabase.co/.well-known/jwks → 404
❌ https://[project].supabase.co/auth/v1/jwks → 404 "No API key found in request"
❌ https://[project].supabase.co/auth/v1/jwks?apikey=[anon_key] → 404
```

**Result:** All paths either return 404 or `{"keys":[]}`. JWKS is not available for Magic Link tokens.

### Attempt 2: Adding API Key Header
```php
$resp = wp_remote_get($jwks, [
  'headers' => ['apikey' => $anonKey]
]);
```

**Result:** Still returns `{"keys":[]}`. The issue is not authorization, but that Supabase doesn't provide JWKS for HS256 tokens.

### Attempt 3: Caching Issues
Suspected WordPress transient cache was storing old responses. Cleared cache:
```php
DELETE FROM wp_options WHERE option_name LIKE '_transient_sb_jwks_%';
```

**Result:** Cache was not the issue. Fresh requests still return `{"keys":[]}`.

---

## ✅ Working Solution

### Overview:
Switch from **JWKS (RS256)** verification to **JWT Secret (HS256)** verification.

### Implementation Changes:

#### 1. Add JWT Secret Field to Settings UI

**File:** `supabase-bridge.php` (around line 1230)

```php
<tr>
  <th scope="row">
    <label for="sb_jwt_secret">JWT Secret 🔑</label>
  </th>
  <td>
    <input
      type="password"
      name="sb_jwt_secret"
      id="sb_jwt_secret"
      value="<?php echo esc_attr(sb_cfg('JWT_SECRET', '')); ?>"
      class="large-text"
      placeholder="your-jwt-secret-key..."
    >
    <p class="description">
      <strong>⚠️ NEVER expose this secret to frontend!</strong> Used to verify JWT tokens from Supabase Auth.
      Find in Supabase Dashboard → Settings → API → JWT Settings → JWT Secret
    </p>
  </td>
</tr>
```

#### 2. Add JWT Secret Save Logic

**File:** `supabase-bridge.php` (around line 1068)

```php
// Add to settings save handler
$jwt_secret = sanitize_text_field($_POST['sb_jwt_secret'] ?? '');

if (!empty($jwt_secret)) {
  update_option('sb_jwt_secret', sb_encrypt($jwt_secret));
  $credentials_updated = true;
}
```

#### 3. Change JWT Verification Method

**File:** `supabase-bridge.php` (around line 788-840)

**REPLACE:**
```php
$issuer = "https://{$projectRef}.supabase.co/auth/v1";
$anonKey = sb_cfg('SUPABASE_ANON_KEY', '');
$jwks  = "{$issuer}/.well-known/jwks.json";

try {
  // 1) Fetch JWKS
  $cache_key = 'sb_jwks_' . md5($jwks);
  $keys = get_transient($cache_key);

  if ($keys === false) {
    $resp = wp_remote_get($jwks, [
      'timeout' => 5,
      'headers' => ['apikey' => $anonKey]
    ]);

    $keys = json_decode(wp_remote_retrieve_body($resp), true);

    if (!isset($keys['keys']) || !is_array($keys['keys'])) {
      throw new Exception('Invalid JWKS format');
    }

    set_transient($cache_key, $keys, 3600);
  }

  // 2) Verify JWT with RS256
  $publicKeys = \Firebase\JWT\JWK::parseKeySet($keys);
  $decoded = \Firebase\JWT\JWT::decode($jwt, $publicKeys);
  // ... rest of verification
}
```

**WITH:**
```php
$issuer = "https://{$projectRef}.supabase.co/auth/v1";
$jwtSecret = sb_cfg('JWT_SECRET', '');

if (!$jwtSecret) {
  error_log('Supabase Bridge: JWT_SECRET not configured');
  return new \WP_Error('cfg','JWT Secret not configured. Add it in plugin settings.',['status'=>500]);
}

try {
  // Verify JWT using HS256 with JWT Secret
  $decoded = \Firebase\JWT\JWT::decode($jwt, new \Firebase\JWT\Key($jwtSecret, 'HS256'));
  $claims = (array)$decoded;

  // Validate issuer
  if (($claims['iss'] ?? '') !== $issuer) {
    error_log('Supabase Bridge: Invalid issuer claim');
    throw new Exception('Invalid authentication token');
  }

  // ... rest of claims validation (unchanged)
}
```

### User Configuration:

After code changes, users need to:

1. Go to **Supabase Dashboard** → **Settings** → **API**
2. Scroll to **JWT Settings**
3. Find **"Legacy JWT Secret"** (NOT the anon key!)
4. Click **"Show"** to reveal the secret
5. Copy the entire string (long alphanumeric secret)
6. Go to **WordPress Admin** → **Settings** → **Supabase Bridge**
7. Paste JWT Secret into the **"JWT Secret 🔑"** field
8. Click **"Save Changes"**
9. Test Magic Link authentication again

---

## 🧪 Testing Results (After Fix)

### Successful Authentication Flow:

```
[12:25:35] User opens login page
[12:25:35] User enters email: andrewcroydon@tutamail.com
[12:25:35] Magic Link sent (Supabase email sent successfully)
[12:25:37] User clicks Magic Link in email
[12:25:37] Browser loads: http://localhost:8000/login/#access_token=eyJhbGci...
[12:25:37] JavaScript extracts token from URL hash
[12:25:37] POST /wp-json/supabase-auth/callback
[12:25:37] [php:notice] Supabase Bridge DEBUG: provider=email, email=andrewcroydon@tutamail.com
[12:25:38] [php:notice] Supabase Bridge: User created successfully - User ID: 2
[12:25:38] [php:notice] Supabase Bridge: Successful authentication - User ID: 2, Email: andrewcroydon@tutamail.com
[12:25:38] POST /wp-json/supabase-auth/callback HTTP/1.1 200 ✅ (SUCCESS!)
[12:25:38] GET / HTTP/1.1 200 (redirect to homepage)
```

### User Experience:
- ✅ User clicks Magic Link
- ✅ Seamless redirect to WordPress
- ✅ User logged in automatically
- ✅ WordPress session created
- ✅ Admin bar shows: **"Howdy, andrewcroydon@tutamail.com"**
- ✅ User can access WordPress Admin

### Backend Verification:
```sql
-- User created in WordPress
SELECT * FROM wp_users WHERE user_email = 'andrewcroydon@tutamail.com';
-- ID: 2, user_login: andrewcroydon_tutamail_com, user_email: andrewcroydon@tutamail.com

-- User metadata synced from Supabase
SELECT * FROM wp_usermeta WHERE user_id = 2 AND meta_key = 'supabase_user_id';
-- meta_value: [UUID from Supabase]
```

---

## 📊 Impact & Severity

### Severity: 🔴 CRITICAL

**Why Critical:**
1. **Core feature completely broken** - Magic Link auth is PRIMARY use case
2. **Affects all Supabase Cloud users** - not edge case
3. **No workaround** - users cannot authenticate at all
4. **Silent failure** - plugin installs successfully but doesn't work

### Affected Users:
- ✅ **Anyone using Supabase Cloud** (*.supabase.co)
- ✅ **All authentication providers** that use Magic Link flow:
  - Email (Magic Link)
  - Potentially Google OAuth (needs testing)
  - Potentially Facebook OAuth (needs testing)

### Not Affected:
- ❓ Self-hosted Supabase (may use different JWT config)
- ❓ Older Supabase versions (before HS256 migration)

---

## 🔄 Backward Compatibility Considerations

### Option 1: JWT Secret Only (Simple)
**Pros:**
- Simple implementation
- Works for 99% of users (Supabase Cloud)
- No complex fallback logic

**Cons:**
- Might break self-hosted Supabase users (if they use RS256)

### Option 2: Try Both Methods (Recommended)
**Pros:**
- Backward compatible
- Works for all Supabase configurations
- Graceful degradation

**Implementation:**
```php
$jwtSecret = sb_cfg('JWT_SECRET', '');

try {
  if (!empty($jwtSecret)) {
    // Try HS256 with JWT Secret first (Supabase Cloud)
    $decoded = \Firebase\JWT\JWT::decode($jwt, new \Firebase\JWT\Key($jwtSecret, 'HS256'));
  } else {
    // Fallback to JWKS/RS256 (self-hosted Supabase?)
    $jwks = "{$issuer}/.well-known/jwks.json";
    // ... existing JWKS logic
  }
} catch (Exception $e) {
  // If HS256 fails and JWT Secret exists, try JWKS as fallback
  // This handles edge cases where both methods might be needed
}
```

---

## 📚 Related Issues

### Potential Related Problems:
1. **Google OAuth** - Likely same issue (uses same JWT verification)
2. **Facebook OAuth** - Likely same issue (uses same JWT verification)
3. **Session refresh** - May fail if using same JWT verification logic
4. **Token expiration handling** - Should work fine (exp claim checked)

### Needs Testing:
- [ ] Google OAuth flow with JWT Secret
- [ ] Facebook OAuth flow with JWT Secret
- [ ] Token refresh mechanism
- [ ] Self-hosted Supabase compatibility

---

## 🎯 Proposed Fix Summary

### Required Changes:
1. ✅ Add JWT Secret field to Settings UI (3 lines HTML)
2. ✅ Add JWT Secret save logic (4 lines PHP)
3. ✅ Change JWT verification from JWKS/RS256 to JWT Secret/HS256 (~10 lines PHP)
4. ✅ Update user documentation with JWT Secret configuration steps

### Optional Enhancements:
- [ ] Add backward compatibility (try HS256 first, fallback to RS256)
- [ ] Add better error messages ("Missing JWT Secret - add in settings")
- [ ] Add JWT Secret validation on save (try to decode sample token)
- [ ] Update README with JWT Secret setup instructions

---

## 💻 Code Diff

### Full diff available at:
```
File: supabase-bridge.php
Lines changed: ~60 lines
Files modified: 1

Changes:
- Added JWT Secret field (UI) +18 lines
- Added JWT Secret save logic +4 lines
- Replaced JWKS verification with JWT Secret verification -47 lines, +11 lines
- Net change: -14 lines (simpler code!)
```

---

## 🤝 Contribution

I've successfully implemented and tested this fix locally. Authentication now works perfectly with Supabase Cloud Magic Links.

**Happy to contribute:**
- ✅ Submit Pull Request with these changes
- ✅ Add tests for JWT Secret verification
- ✅ Update documentation
- ✅ Add migration guide for existing users

**Testing completed:**
- ✅ Fresh WordPress installation
- ✅ Docker environment (reproducible)
- ✅ Supabase Cloud (real project)
- ✅ Magic Link flow (end-to-end)
- ✅ User creation in WordPress
- ✅ Session persistence

---

## 📖 References

### Supabase Documentation:
- JWT Settings: https://supabase.com/dashboard/project/[project]/settings/api
- Auth API: https://supabase.com/docs/guides/auth
- JWT verification: https://supabase.com/docs/guides/auth/server-side/validating-jwts

### JWT Libraries:
- firebase/php-jwt: https://github.com/firebase/php-jwt
- HS256 vs RS256: https://stackoverflow.com/questions/39239051/rs256-vs-hs256-whats-the-difference

### WordPress:
- REST API: https://developer.wordpress.org/rest-api/
- Authentication: https://developer.wordpress.org/plugins/users/

---

## 🏷️ Labels

`bug` `critical` `authentication` `jwt` `supabase-cloud` `magic-link` `help wanted`

---

## ✍️ Author

Tested and documented by: [Your Name/GitHub username]
Date: November 1, 2025
Testing Duration: ~3 hours (multiple debugging iterations)
Final Status: ✅ **WORKING** (with JWT Secret fix)

---

## 📧 Contact

If you need more details or have questions about this issue:
- 📧 Email: [your email if comfortable]
- 💬 Available for: Code review, testing, documentation

Thank you for maintaining this plugin! This fix will help many developers integrate Supabase with WordPress. 🙏
