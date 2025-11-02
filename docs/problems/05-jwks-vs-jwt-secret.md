# Problem #5: JWKS vs JWT Secret (Critical JWT Verification Issue)

**Severity:** 🔴 CRITICAL
**Time to Debug:** ~75 minutes
**Time to Fix:** ~20 minutes
**Session:** 2 (2025-11-01)

---

## TL;DR

Plugin used RS256 (JWKS) for JWT verification, but Supabase Cloud uses HS256 (JWT Secret). JWKS endpoint returned empty array `{"keys": []}`, causing all authentication to fail with 401.

---

## Symptoms

```
POST /wp-json/supabase-auth/callback 401 (Unauthorized)

Docker logs:
PHP Fatal error: JWK Set did not contain any keys
at supabase-bridge.php:234
```

---

## Root Cause Analysis

### What Plugin Expected (RS256):

```php
// Fetch JWKS from Supabase
$jwks_url = 'https://PROJECT.supabase.co/auth/v1/.well-known/jwks.json';
$jwks = file_get_contents($jwks_url);

// Parse public keys
$keys = JWK::parseKeySet($jwks);  // Expects: {"keys": [{...}]}

// Verify JWT with public key
$decoded = JWT::decode($token, $keys);
```

### What Supabase Actually Provides (HS256):

```bash
curl https://PROJECT.supabase.co/auth/v1/.well-known/jwks.json
# Returns:
{
  "keys": []  # Empty array!
}
```

**Why empty?**
- Supabase Cloud uses **HS256** (symmetric encryption)
- HS256 = one secret for both signing AND verifying
- JWKS only needed for **RS256** (asymmetric, public/private keys)
- Supabase provides "Legacy JWT Secret" instead

---

## Technical Background

### RS256 vs HS256

| Aspect | RS256 | HS256 |
|--------|-------|-------|
| Type | Asymmetric | Symmetric |
| Keys | Private (sign) + Public (verify) | One secret (sign + verify) |
| Use Case | Distributed verification | Single-service verification |
| JWKS | Yes (public keys exposed) | No (secret is private!) |
| Supabase Cloud | ❌ Not used | ✅ Default method |

### Why Supabase Uses HS256:

1. **Simplicity:** One secret vs managing key pairs
2. **Performance:** HMAC faster than RSA
3. **Security:** Secret never exposed (unlike RS256 public key)
4. **Compatibility:** Works with all JWT libraries

---

## Solution

### Code Changes:

```php
// BEFORE (BROKEN):
function sb_verify_jwt($jwt) {
    $jwks_url = sb_cfg('URL') . '/auth/v1/.well-known/jwks.json';
    $jwks = sb_fetch_jwks($jwks_url);
    $keys = JWK::parseKeySet($jwks);  // ← Fails! Empty array
    $decoded = JWT::decode($jwt, $keys);
    return $decoded;
}

// AFTER (FIXED):
function sb_verify_jwt($jwt) {
    // Get JWT Secret from WordPress settings
    $jwt_secret = sb_cfg('JWT_SECRET');

    if (empty($jwt_secret)) {
        throw new Exception('JWT Secret not configured');
    }

    // Verify with HS256
    $decoded = JWT::decode($jwt, new Key($jwt_secret, 'HS256'));
    return (array)$decoded;
}
```

### Where to Get JWT Secret:

**Supabase Dashboard:**
1. Settings → API
2. Scroll to "JWT Settings"
3. **JWT Secret (Legacy)** → Click "Show"
4. Copy entire secret (~50 characters)

**WordPress Settings:**
1. Settings → Supabase Bridge
2. Paste into "JWT Secret" field
3. Save Changes

---

## Testing

### Verify JWT Secret Works:

```bash
# Test with real token (from browser console after auth)
docker compose exec wordpress php -r "
require '/var/www/html/wp-content/plugins/supabase-bridge/vendor/autoload.php';
use Firebase\JWT\JWT;
use Firebase\JWT\Key;

\$jwt = 'eyJhbGci...';  // Your access_token
\$secret = 'your-jwt-secret';

try {
    \$decoded = JWT::decode(\$jwt, new Key(\$secret, 'HS256'));
    echo 'JWT Valid!' . PHP_EOL;
    print_r(\$decoded);
} catch (Exception \$e) {
    echo 'JWT Invalid: ' . \$e->getMessage() . PHP_EOL;
}
"
```

**Expected output:**
```
JWT Valid!
stdClass Object
(
    [sub] => 3f8a2c5d-...
    [email] => test@example.com
    [aud] => authenticated
    [exp] => 1699012345
    ...
)
```

---

## Prevention for Future

### 1. Always Check Documentation First

**Before implementing JWT verification:**
- Read provider's docs (Supabase, Auth0, Firebase)
- Check what algorithm they use (HS256, RS256, ES256)
- Verify JWKS endpoint if using RS256

### 2. Add Algorithm Validation

```php
// Explicitly check algorithm
$header = json_decode(base64_decode(explode('.', $jwt)[0]), true);

if ($header['alg'] !== 'HS256') {
    throw new Exception('Unsupported JWT algorithm: ' . $header['alg']);
}
```

### 3. Schema Version Detection

```php
// Future-proof for Supabase self-hosted (may use RS256)
$jwks = file_get_contents($jwks_url);
$keys = json_decode($jwks, true);

if (empty($keys['keys'])) {
    // Use HS256 with secret
    $decoded = JWT::decode($jwt, new Key($jwt_secret, 'HS256'));
} else {
    // Use RS256 with JWKS
    $keys = JWK::parseKeySet($keys);
    $decoded = JWT::decode($jwt, $keys);
}
```

---

## Related Issues

- **GitHub Issue:** [issue-01-jwt-jwks-vs-secret.md](../../issues/issue-01-jwt-jwks-vs-secret.md)
- **Session Notes:** [2025-11-01-session2.md](../sessions/2025-11-01-session2.md#0050---исследование-supabase-docs)
- **Architecture Doc:** [ARCHITECTURE.md](../ARCHITECTURE.md#-jwt-verification-critical) (lines 85-115)

---

## References

- **Supabase Docs:** [JWT Verification](https://supabase.com/docs/guides/auth/server-side/validating-jwts)
- **JWT.io:** [HS256 vs RS256](https://jwt.io/)
- **RFC 7518:** [JSON Web Algorithms (JWA)](https://tools.ietf.org/html/rfc7518)

---

**Lessons Learned:**
1. JWKS ≠ always available (only for RS256)
2. HS256 is common for SaaS providers
3. Always read API docs before implementing crypto
4. Test with real tokens early!

**Time Saved Next Time:** ~75 minutes debugging + ~20 minutes researching
