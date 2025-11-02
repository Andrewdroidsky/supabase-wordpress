# Troubleshooting Guide

> **Цель:** Быстро решить частые проблемы (5-10 минут на проблему)

---

## 🔍 Quick Diagnostics

### Step 1: Check Docker Status
```bash
docker compose ps
```

**Ожидается:**
```
NAME              STATUS
supabase_wp_db    Up
supabase_wp       Up
```

**Если DOWN:**
```bash
docker compose up -d
docker compose logs wordpress --tail=50
```

### Step 2: Check WordPress
```
http://localhost:8000
```

**Ожидается:** WordPress главная страница

**Если Error 500:**
- Check Docker logs: `docker compose logs wordpress --tail=100`
- Check MySQL: `docker compose logs db --tail=100`

### Step 3: Check REST API
```
http://localhost:8000/wp-json/
```

**Ожидается:** JSON response

**Если 404:**
- Permalinks не настроены → [#3: REST API 404](#3-rest-api-404)

### Step 4: Check Browser Console
**F12 → Console**

**Look for:**
- ❌ Red errors (JavaScript errors)
- ⚠️ Yellow warnings (CSP violations, deprecated APIs)
- ✅ Green success messages (`Supabase Auth initialized`)

---

## 💥 Common Problems

### #1: JWT Verification Failed (401)

**Симптомы:**
```
POST /wp-json/supabase-auth/callback 401 (Unauthorized)
Auth error: JWK Set did not contain any keys
```

**Причина:** JWT Secret не настроен или неправильный

**Решение:**

1. **Получить JWT Secret из Supabase:**
   - Dashboard → Settings → API → JWT Settings
   - Legacy JWT Secret → Show → Copy

2. **Добавить в WordPress:**
   - WordPress Admin → Settings → Supabase Bridge
   - Поле "JWT Secret 🔑" → Paste
   - Save Changes

3. **Перезапустить WordPress:**
```bash
docker compose restart wordpress
```

4. **Очистить localStorage:**
```javascript
// В Browser Console (F12)
localStorage.clear()
```

**Детальный разбор:** [problems/05-jwks-vs-jwt-secret.md](problems/05-jwks-vs-jwt-secret.md)

---

### #2: Google OAuth Not Working

**Симптомы:**
- Magic Link работает ✅
- Google OAuth не работает ❌
- Console: `Token already processed, skipping`
- Redirect от Google, но нет POST к `/callback`

**Причина:** `sessionStorage` очищается при cross-origin redirect

**Решение:** Уже исправлено в auth-form.js (sessionStorage → localStorage)

**Если проблема осталась:**

1. **Проверить версию auth-form.js:**
```javascript
// В Browser Console
fetch('/wp-content/plugins/supabase-bridge/auth-form.js')
  .then(r => r.text())
  .then(t => console.log(t.includes('localStorage.setItem') ? '✅ Fixed' : '❌ Old version'))
```

2. **Hard reload страницы:**
- Ctrl+Shift+R (Windows/Linux)
- Cmd+Shift+R (macOS)

3. **Или Incognito mode:**
- Ctrl+Shift+N (Chrome)
- Ctrl+Shift+P (Firefox)

**Детальный разбор:** [problems/06-google-oauth-storage.md](problems/06-google-oauth-storage.md)

---

### #3: REST API 404

**Симптомы:**
```
POST /wp-json/supabase-auth/callback 404 (Not Found)
```

**Причина:** WordPress permalinks не настроены (используются "Plain")

**Решение:**

1. **WordPress Admin → Settings → Permalinks**

2. **Выбрать:** Post name

3. **Save Changes**

4. **Проверить:**
```
http://localhost:8000/wp-json/
```

**Ожидается:** JSON response (не 404)

**Детальный разбор:** [problems/03-rest-api-permalinks.md](problems/03-rest-api-permalinks.md)

---

### #4: Magic Link Not Working

**Симптомы:**
- Email приходит ✅
- Кликаю по ссылке ❌
- Redirect на главную, но не залогинен

**Причина 1: Email Confirmation включен**

**Решение:**
1. Supabase Dashboard → Authentication → Settings
2. Providers → Email → Edit
3. **Confirm email:** OFF (toggle выключить)
4. Save

**Причина 2: Неправильная страница**

**Решение:**
- Убедиться что на странице есть шорткод `[supabase_auth_form]`
- URL должен быть `/login/` (или другой с шорткодом)

**Детальный разбор:** [problems/04-email-confirmation.md](problems/04-email-confirmation.md)

---

### #5: Redirect на Blog вместо Thank You Page

**Симптомы:**
- Google OAuth → Thank You page (/registr/) ✅
- Magic Link → Blog (/) ❌

**Причина:** Пользователь создан > 24 часа назад (считается "существующим")

**Решение 1: Тестировать с НОВЫМ email**
```
test-new-user-123@example.com
```

**Решение 2: Увеличить порог**
- Уже исправлено: `newUserThreshold: 86400000` (24 часа)
- Если нужно больше: изменить в `auth-form.js:27`

**Решение 3: Очистить кеш**
- Hard reload: Ctrl+Shift+R
- Или Incognito mode

**Детальный разбор:** [problems/09-redirect-threshold.md](problems/09-redirect-threshold.md)

---

### #6: Missing Column Error

**Симптомы:**
```
HTTP 400: Could not find the 'thankyou_page_url' column
```

**Причина:** SQL schema не синхронизирована с PHP код ом

**Решение:**

1. **Supabase Dashboard → SQL Editor**

2. **Запустить:**
```sql
ALTER TABLE wp_user_registrations
ADD COLUMN IF NOT EXISTS thankyou_page_url TEXT;
```

3. **Проверить:**
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'wp_user_registrations';
```

**Ожидается:** `thankyou_page_url` в списке

**Детальный разбор:** [problems/07-missing-column.md](problems/07-missing-column.md)

---

### #7: CSP Errors (Web Workers)

**Симптомы:**
```
Refused to create a worker from 'blob:...' because it violates
the following Content Security Policy directive
```

**Причина:** CSP headers не разрешают Web Workers

**Решение:** Уже исправлено в supabase-bridge.php

**Если проблема осталась:**

1. **Проверить CSP headers:**
```bash
curl -I http://localhost:8000/login/ | grep -i "content-security"
```

**Должно содержать:**
```
script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net blob:
worker-src 'self' blob:
```

2. **Если нет - перезапустить WordPress:**
```bash
docker compose restart wordpress
```

**Детальный разбор:** [problems/01-csp-headers-workers.md](problems/01-csp-headers-workers.md)

---

### #8: JavaScript Syntax Error

**Симптомы:**
```
Uncaught SyntaxError: Invalid or unexpected token
at auth-form.html:1052
```

**Причина:** WordPress фильтры превращают `&&` в `&#038;&#038;`

**Решение:** Уже исправлено (JavaScript вынесен в отдельный файл)

**Если проблема осталась:**

1. **View Page Source** (Ctrl+U)

2. **Найти:** `&#038;&#038;`

3. **Если найдено** - JavaScript встроен в HTML (неправильно!)

4. **Должно быть:**
```html
<script src="/wp-content/plugins/supabase-bridge/auth-form.js"></script>
```

**Детальный разбор:** [problems/02-wordpress-filters-js.md](problems/02-wordpress-filters-js.md)

---

### #9: wp_user_registrations Empty

**Симптомы:**
- Логин работает ✅
- Таблица `wp_user_registrations` пустая ❌

**Причина:** Логирование только для новых пользователей

**Решение:** Уже исправлено (функция вынесена из `if (!$user)` блока)

**Проверить fix:**

1. **Logout из WordPress**

2. **Залогиниться снова** (любым способом)

3. **Проверить таблицу:**
```sql
SELECT * FROM wp_user_registrations ORDER BY registered_at DESC LIMIT 1;
```

**Ожидается:** Новая запись с текущим timestamp

**Детальный разбор:** [problems/08-logging-existing-users.md](problems/08-logging-existing-users.md)

---

## 🔧 Advanced Debugging

### Docker Logs (Real-time)

**Watch WordPress logs:**
```bash
docker compose logs wordpress --follow
```

**Filter for errors:**
```bash
docker compose logs wordpress --follow | grep -i "error"
```

**Filter for Supabase Bridge:**
```bash
docker compose logs wordpress --follow | grep "Supabase Bridge"
```

### Database Inspection

**Connect to MySQL:**
```bash
docker compose exec db mysql -uwordpress -pwordpress_password wordpress
```

**Useful queries:**
```sql
-- Check users
SELECT ID, user_email, user_login FROM wp_users;

-- Check meta
SELECT * FROM wp_usermeta WHERE meta_key = 'supabase_user_id';

-- Check options
SELECT option_name, option_value FROM wp_options WHERE option_name LIKE 'sb_%';
```

### Supabase Dashboard

**Authentication → Users:**
- Check if user exists
- Check provider (email, google, facebook)
- Check email_confirmed status

**Table Editor → wp_user_registrations:**
- Check if registration logged
- Check timestamps
- Check user_id matches auth.users

**Logs → API:**
- Filter by status: 400, 500
- Check error messages
- Check request payloads

---

## 📞 Still Having Issues?

### 1. Check Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - Understand how it works
- [problems/](problems/) - Detailed analysis of all 9 problems
- [sessions/](sessions/) - Full history of debugging sessions

### 2. Check GitHub Issues

**Original plugin:**
https://github.com/alexeykrol/supabase-wordpress/issues

**Our documented issues:**
- [issues/](../issues/) - Ready to submit

### 3. Fresh Install

**Nuclear option (if nothing works):**

```bash
# Stop and remove containers
docker compose down -v

# Remove WordPress data (WARNING: destroys everything!)
docker volume rm supabase_wordpress_db_data
docker volume rm supabase_wordpress_wordpress_data

# Start fresh
docker compose up -d
```

**Then follow:** [SETUP.md](SETUP.md) from step 5

---

## ✅ Quick Checklist

Before asking for help, verify:

- [ ] Docker containers are running (`docker compose ps`)
- [ ] WordPress accessible (`http://localhost:8000`)
- [ ] REST API working (`http://localhost:8000/wp-json/`)
- [ ] Permalinks set to "Post name"
- [ ] Plugin activated (Plugins → Supabase Bridge → Active)
- [ ] Supabase URL added (Settings → Supabase Bridge)
- [ ] Supabase Anon Key added
- [ ] JWT Secret added (critical!)
- [ ] Email confirmation OFF in Supabase
- [ ] Login page has `[supabase_auth_form]` shortcode
- [ ] Browser console checked (F12)
- [ ] Docker logs checked (`docker compose logs wordpress --tail=100`)

---

**Последнее обновление:** 2025-11-02
**Версия:** 1.0.0

**Экономия времени:** ~2 часа отладки благодаря этому guide! 🎉
