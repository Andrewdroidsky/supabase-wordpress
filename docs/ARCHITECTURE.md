# Architecture - How Supabase WordPress Bridge Works

> **Цель:** Понять как работает аутентификация и интеграция WordPress + Supabase

---

## 🏗️ High-Level Architecture

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Browser   │◄───────►│  Supabase    │◄───────►│  WordPress  │
│  (Frontend) │         │    Auth      │         │  (Backend)  │
└─────────────┘         └──────────────┘         └─────────────┘
      │                        │                         │
      │                        │                         │
      ▼                        ▼                         ▼
  auth-form.js         JWT Tokens              supabase-bridge.php
  localStorage         Magic Link              REST API endpoint
  Web Workers          OAuth Flow              User Creation
                                               JWT Verification
```

---

## 🔄 Authentication Flow

### Magic Link Flow

```
1. User enters email
   ↓
2. Browser → Supabase Auth API
   POST /auth/v1/magiclink
   { email: "user@example.com" }
   ↓
3. Supabase sends email
   Link: https://PROJECT.supabase.co/auth/v1/verify?token=xxx&type=magiclink
   ↓
4. User clicks link
   ↓
5. Supabase redirects back to WordPress
   http://localhost:8000/login/#access_token=JWT&refresh_token=JWT&...
   ↓
6. auth-form.js extracts tokens from URL hash
   ↓
7. JavaScript sends tokens to WordPress backend
   POST /wp-json/supabase-auth/callback
   { access_token, refresh_token }
   ↓
8. supabase-bridge.php verifies JWT with JWT Secret
   ↓
9. WordPress creates/finds user by Supabase User ID
   ↓
10. WordPress sets cookie (wp_login)
   ↓
11. Browser redirects to Thank You page or Blog
```

### Google OAuth Flow

```
1. User clicks "Continue with Google"
   ↓
2. Browser → Supabase Auth API
   GET /auth/v1/authorize?provider=google
   ↓
3. Supabase redirects to Google OAuth
   https://accounts.google.com/o/oauth2/v2/auth?...
   ↓
4. User logs in to Google & authorizes app
   ↓
5. Google redirects to Supabase callback
   https://PROJECT.supabase.co/auth/v1/callback?code=xxx&provider=google
   ↓
6. Supabase exchanges code for tokens
   ↓
7. Supabase redirects to WordPress
   http://localhost:8000/login/#access_token=JWT&refresh_token=JWT&...
   ↓
8-11. Same as Magic Link (steps 6-11)
```

---

## 🔐 JWT Verification (Critical!)

### Problem: JWKS vs JWT Secret

**Плагин изначально использовал RS256 (JWKS):**
```php
// WRONG for Supabase Cloud
$jwks_url = "https://PROJECT.supabase.co/auth/v1/.well-known/jwks.json";
$keys = fetch_jwks($jwks_url);  // Returns {"keys": []} ← EMPTY!
$decoded = JWT::decode($token, JWK::parseKeySet($keys));  // FAILS!
```

**Supabase Cloud использует HS256 (JWT Secret):**
```php
// CORRECT for Supabase Cloud
$jwt_secret = get_option('sb_jwt_secret');  // From Settings
$decoded = JWT::decode($token, new Key($jwt_secret, 'HS256'));  // WORKS!
```

### Why JWKS Returns Empty Array?

**Supabase Cloud:**
- Uses "Legacy JWT Secret" (HS256 symmetric encryption)
- JWKS endpoint exists but returns `{"keys": []}` (no public keys)
- JWT Secret is stored in Settings → API → JWT Settings

**Supabase Self-Hosted (future):**
- May use "JWT Signing Keys" (RS256 asymmetric encryption)
- JWKS endpoint would return public keys
- Plugin code would need to support both methods

---

## 📦 Component Breakdown

### 1. Frontend (auth-form.js)

**Responsibilities:**
- Render authentication form (email, Google, Facebook buttons)
- Handle Supabase JS SDK initialization
- Listen for auth state changes
- Extract tokens from URL hash after OAuth redirect
- Send tokens to WordPress backend via REST API
- Handle redirects (Thank You page vs Blog)

**Key Functions:**
```javascript
// Initialize Supabase client
const supabase = createClient(url, anonKey);

// Handle auth state changes
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN') {
    sendTokenToWordPress(session);
  }
});

// Send tokens to backend
async function sendTokenToWordPress(session) {
  const response = await fetch('/wp-json/supabase-auth/callback', {
    method: 'POST',
    body: JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token
    })
  });
}
```

**localStorage vs sessionStorage:**
- Uses `localStorage` for OAuth redirect persistence
- Auto-cleanup старых токенов при загрузке страницы

### 2. Backend (supabase-bridge.php)

**Responsibilities:**
- Register REST API endpoint `/wp-json/supabase-auth/callback`
- Verify JWT token with JWT Secret (HS256)
- Extract user data from JWT claims (email, user_id, provider)
- Create or find WordPress user
- Set WordPress cookie (authenticate user)
- Log registration to Supabase table
- Return redirect URL (Thank You page or Blog)

**Key Functions:**
```php
// Register REST API endpoint
register_rest_route('supabase-auth', '/callback', [
  'methods' => 'POST',
  'callback' => 'sb_handle_auth_callback',
]);

// Verify JWT token
function sb_verify_jwt($jwt) {
  $jwt_secret = sb_cfg('JWT_SECRET');
  $decoded = JWT::decode($jwt, new Key($jwt_secret, 'HS256'));
  return (array)$decoded;
}

// Create or find WordPress user
function sb_create_or_find_user($email, $supabase_user_id) {
  // Try to find by supabase_user_id meta
  $user = find_user_by_supabase_id($supabase_user_id);

  if (!$user) {
    // Create new WordPress user
    $user_id = wp_create_user($username, wp_generate_password(), $email);
    update_user_meta($user_id, 'supabase_user_id', $supabase_user_id);
  }

  return $user;
}
```

### 3. Database (Supabase Tables)

**wp_registration_pairs:**
```sql
CREATE TABLE wp_registration_pairs (
  id UUID PRIMARY KEY,
  registration_url TEXT NOT NULL,  -- e.g., "/pricing/"
  thankyou_page_url TEXT NOT NULL, -- e.g., "/thank-you/"
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Purpose:** Map registration URL → Thank You page URL (for custom redirects)

**wp_user_registrations:**
```sql
CREATE TABLE wp_user_registrations (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  pair_id UUID REFERENCES wp_registration_pairs(id),
  user_email TEXT NOT NULL,
  registration_url TEXT,
  thankyou_page_url TEXT,  -- ADDED in our fix!
  registered_at TIMESTAMPTZ DEFAULT now()
);
```

**Purpose:** Log all user registrations (for analytics, webhook triggers)

**RLS Policies:**
- Anonymous users: READ only (view registration pairs)
- Authenticated users: INSERT into wp_user_registrations (log their own registration)

### 4. Webhook System (Optional)

**Database Trigger:**
```sql
CREATE TRIGGER on_user_registration_webhook
AFTER INSERT ON wp_user_registrations
FOR EACH ROW
EXECUTE FUNCTION trigger_registration_webhook();
```

**Function logic:**
1. New row inserted into `wp_user_registrations`
2. Trigger calls `trigger_registration_webhook()`
3. Function creates record in `webhook_logs` (status: pending)
4. Function calls `pg_net.http_post()` to Edge Function
5. Edge Function forwards event to Make.com

---

## 🔄 Data Flow Diagram

### Successful Authentication

```
┌─────────────────────────────────────────────────────────────┐
│                         BROWSER                             │
│                                                             │
│  1. User clicks "Continue with Google"                     │
│     auth-form.js calls supabase.auth.signInWithOAuth()     │
│                                                             │
│  2. Redirect to Google OAuth                               │
│     https://accounts.google.com/...                        │
│                                                             │
│  3. User authorizes → Google redirects to Supabase         │
│     https://PROJECT.supabase.co/auth/v1/callback?code=xxx  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                        SUPABASE AUTH                        │
│                                                             │
│  4. Exchange code for JWT tokens                           │
│     access_token (JWT), refresh_token (JWT)                │
│                                                             │
│  5. Redirect back to WordPress with tokens in URL hash     │
│     http://localhost:8000/login/#access_token=JWT&...      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                         BROWSER                             │
│                                                             │
│  6. auth-form.js extracts tokens from URL                  │
│     const { access_token, refresh_token } = parseHash();   │
│                                                             │
│  7. POST tokens to WordPress backend                       │
│     fetch('/wp-json/supabase-auth/callback', ...)          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      WORDPRESS BACKEND                      │
│                                                             │
│  8. Verify JWT token with JWT Secret (HS256)              │
│     $decoded = JWT::decode($jwt, new Key($secret, 'HS256'))│
│                                                             │
│  9. Extract claims: email, user_id, provider               │
│     $email = $decoded['email'];                            │
│     $supabase_user_id = $decoded['sub'];                   │
│                                                             │
│  10. Create or find WordPress user                         │
│      $user = find_or_create_user($email, $supabase_user_id)│
│                                                             │
│  11. Set WordPress cookie (wp_login)                       │
│      wp_set_auth_cookie($user->ID);                        │
│                                                             │
│  12. Log registration to Supabase table                    │
│      INSERT INTO wp_user_registrations (...)               │
│                                                             │
│  13. Return redirect URL to frontend                       │
│      { redirect_url: "/thank-you/" }                       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                         BROWSER                             │
│                                                             │
│  14. Redirect to Thank You page                            │
│      window.location.href = "/thank-you/";                 │
│                                                             │
│  15. User sees WordPress admin bar (logged in)             │
│      "Howdy, user@example.com"                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🛡️ Security Considerations

### 1. JWT Secret Protection
- **NEVER** expose JWT Secret to frontend
- Store in WordPress options (encrypted)
- Only used in backend verification

### 2. Cross-Origin Redirects
- Use `localStorage` (not `sessionStorage`) for OAuth persistence
- Auto-cleanup old tokens to prevent accumulation

### 3. Duplicate Prevention
- Check if user already exists before INSERT
- Use Supabase User ID as unique identifier (not email!)

### 4. Content Security Policy (CSP)
- Allow `blob:` and `worker-src` for Supabase JS SDK Web Workers
- Restrict script-src to trusted CDNs only

### 5. REST API Authentication
- Use WordPress nonces for CSRF protection
- Rate limit authentication endpoint (prevent brute force)

---

## 🔍 Debugging Tips

### 1. Check Docker Logs
```bash
docker compose logs wordpress --tail=100
docker compose logs wordpress --follow
```

**Look for:**
- `Supabase Bridge DEBUG:` messages
- `Successful authentication` confirmations
- HTTP status codes (200, 400, 401, 500)

### 2. Browser Console
```javascript
// Check Supabase client initialization
console.log(supabase);

// Check current session
supabase.auth.getSession().then(console.log);

// Check localStorage for tokens
console.log(localStorage);
```

### 3. Network Tab (DevTools)
- Filter: `/wp-json/supabase-auth/callback`
- Check Request Payload (access_token present?)
- Check Response (redirect_url present?)
- Check Status Code (200 = success, 401 = JWT failed)

### 4. Supabase Dashboard
- **Authentication → Users:** Check if user created
- **Table Editor → wp_user_registrations:** Check if logged
- **Logs → API:** Check for 400/500 errors

---

## 📊 Performance Considerations

### 1. JWT Verification Caching
- Removed JWKS caching (no longer needed with JWT Secret)
- JWT verification is fast (<5ms with HS256)

### 2. User Lookup Optimization
- Primary lookup: by `supabase_user_id` meta (indexed)
- Fallback lookup: by email (slower, rare case)

### 3. Registration Logging
- Non-blocking: INSERT happens after user authentication
- Error in logging does NOT prevent user login

---

## 🚀 Scalability

**Current setup handles:**
- ~100 concurrent users (limited by Docker containers)
- ~10 logins/second (limited by JWT verification speed)

**For production scale:**
1. Move to managed WordPress hosting (WP Engine, Kinsta)
2. Use Supabase Pro plan (higher rate limits)
3. Add Redis caching for user lookups
4. Use CDN for static assets

---

## 📚 Further Reading

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [JWT.io](https://jwt.io/) - Decode and verify JWTs
- [WordPress REST API Handbook](https://developer.wordpress.org/rest-api/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)

---

**Последнее обновление:** 2025-11-02
**Версия:** 1.0.0
