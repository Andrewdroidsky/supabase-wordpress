# Setup Guide - Supabase WordPress Bridge

> **Цель:** Установить и настроить WordPress с Supabase Auth плагином за 30-45 минут

---

## 📋 Требования

### Обязательно
- ✅ Windows 10/11 (или macOS/Linux)
- ✅ Docker Desktop установлен и запущен
- ✅ Supabase аккаунт (бесплатный tier)
- ✅ 5 GB свободного места на диске
- ✅ Браузер (Chrome/Firefox/Edge)

### Опционально
- Google Developer Console аккаунт (для Google OAuth)
- Facebook Developer аккаунт (для Facebook OAuth)
- Make.com аккаунт (для webhook автоматизации)

---

## 🚀 Шаг 1: Установка Docker Desktop

### Windows

**1. Скачать Docker Desktop:**
https://www.docker.com/products/docker-desktop

**2. Установить:**
- Запустить инсталлятор
- Следовать инструкциям
- **ВАЖНО:** Может потребоваться перезагрузка Windows!

**3. Запустить Docker Desktop:**
- Найти в меню Пуск → Docker Desktop
- Дождаться зеленой иконки в трее (Docker running)

**4. Проверить установку:**
```bash
docker --version
```

**Ожидаемый результат:**
```
Docker version 28.5.1, build e180ab8
```

### macOS

```bash
brew install --cask docker
open /Applications/Docker.app
```

### Linux

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo systemctl start docker
```

---

## 📦 Шаг 2: Клонирование репозитория

```bash
# Выбрать директорию для проекта
cd "C:\Users\YOUR_USERNAME\Downloads\GitHub Projects"

# Клонировать репозиторий
git clone https://github.com/alexeykrol/supabase-wordpress
cd supabase-wordpress
```

**Альтернатива (без git):**
1. Открыть https://github.com/alexeykrol/supabase-wordpress
2. Нажать "Code" → "Download ZIP"
3. Распаковать в удобную директорию

---

## 🐳 Шаг 3: Создание docker-compose.yml

**Создать файл** `docker-compose.yml` **в корне проекта:**

```yaml
version: '3.8'

services:
  # MySQL Database
  db:
    image: mysql:8.0
    container_name: supabase_wp_db
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: wordpress_root_password
      MYSQL_DATABASE: wordpress
      MYSQL_USER: wordpress
      MYSQL_PASSWORD: wordpress_password
    volumes:
      - db_data:/var/lib/mysql
    networks:
      - wordpress_network

  # WordPress with PHP 8.0+
  wordpress:
    image: wordpress:latest
    container_name: supabase_wp
    restart: always
    depends_on:
      - db
    ports:
      - "8000:80"
    environment:
      WORDPRESS_DB_HOST: db:3306
      WORDPRESS_DB_USER: wordpress
      WORDPRESS_DB_PASSWORD: wordpress_password
      WORDPRESS_DB_NAME: wordpress
      WORDPRESS_DEBUG: 1
    volumes:
      # Mount plugin files to WordPress plugins directory
      - ./:/var/www/html/wp-content/plugins/supabase-bridge
      # Persist WordPress data
      - wordpress_data:/var/www/html
    networks:
      - wordpress_network

volumes:
  db_data:
  wordpress_data:

networks:
  wordpress_network:
    driver: bridge
```

**Что это делает:**
- Создает MySQL 8.0 контейнер (база данных)
- Создает WordPress latest контейнер (PHP 8.0+)
- Монтирует плагин в `/wp-content/plugins/supabase-bridge`
- Пробрасывает порт 8000 для доступа через браузер

---

## 🎬 Шаг 4: Запуск Docker контейнеров

```bash
# Запустить контейнеры (первый раз ~5-10 минут)
docker compose up -d
```

**Что происходит:**
1. Docker скачивает образы MySQL и WordPress (~600 МБ)
2. Создает контейнеры `supabase_wp_db` и `supabase_wp`
3. Запускает оба контейнера в background (`-d` = detached)

**Проверить статус:**
```bash
docker compose ps
```

**Ожидаемый результат:**
```
NAME              IMAGE             STATUS
supabase_wp_db    mysql:8.0         Up 2 minutes
supabase_wp       wordpress:latest  Up 2 minutes
```

**Просмотреть логи:**
```bash
docker compose logs wordpress --tail=50
```

---

## 📚 Шаг 5: Установка PHP зависимостей

```bash
# Войти в WordPress контейнер и установить Composer зависимости
docker compose exec wordpress composer install
```

**Что это делает:**
- Устанавливает `firebase/php-jwt` (для JWT verification)
- Создает `vendor/` директорию в плагине

**Ожидаемый результат:**
```
Installing firebase/php-jwt (v6.11.1)
Generating autoload files
```

---

## 🌐 Шаг 6: Настройка WordPress

### 1. Открыть браузер

```
http://localhost:8000
```

### 2. Выбрать язык

- Выбрать: **English** (или **Русский**)
- Нажать: **Continue**

### 3. Создать admin аккаунт

**Заполнить форму:**
- **Site Title:** My Supa WP (или любое название)
- **Username:** admin
- **Password:** (сгенерируется автоматически - сохраните!)
- **Your Email:** your.email@example.com
- **Search Engine Visibility:** (оставить отмеченным)

**Нажать:** Install WordPress

### 4. Войти в админ-панель

```
http://localhost:8000/wp-admin
```

**Использовать:** username и password из шага 3

---

## 🔌 Шаг 7: Активация плагина Supabase Bridge

### 1. В WordPress Admin панели

```
Plugins → Installed Plugins
```

### 2. Найти "Supabase Bridge"

**Должно показать:**
- Name: Supabase Bridge
- Version: 0.8.1
- Author: Alex K
- Description: Supabase Authentication for WordPress

### 3. Нажать "Activate"

**Результат:**
- ✅ Плагин активирован
- ✅ Появился пункт меню: Settings → Supabase Bridge

---

## 🗄️ Шаг 8: Настройка Supabase

### A. Создать Supabase проект (если нет)

**1. Открыть** https://supabase.com

**2. Sign In** (или Create Account)

**3. New Project:**
- **Organization:** Your Organization
- **Name:** wordpress-auth (или любое)
- **Database Password:** (сохранить!)
- **Region:** Europe West (или ближайший)
- **Pricing Plan:** Free

**4. Дождаться создания** (~2 минуты)

### B. Запустить SQL скрипты

**1. Открыть SQL Editor:**
```
Supabase Dashboard → SQL Editor → New Query
```

**2. Скрипт #1: Создание таблиц**

**Скопировать содержимое** `supabase-tables.sql` **и запустить:**

```sql
-- Creates tables: wp_registration_pairs, wp_user_registrations
-- Enable RLS on both tables
```

**Нажать:** Run

**Результат:** Success. 0 rows returned

**3. Скрипт #2: Security Policies**

**Скопировать содержимое** `SECURITY_RLS_POLICIES_FINAL.sql` **и запустить:**

```sql
-- Creates RLS policies for security
-- ⚠️ Supabase покажет "Potential issue: Query has destructive operation"
-- Это БЕЗОПАСНО - просто обновляются политики
```

**Нажать:** Run (подтвердить предупреждение)

**Результат:** Success. 0 rows returned

**4. (Опционально) Скрипт #3: Webhook System**

**Если нужна интеграция с Make.com:**

**Скопировать содержимое** `webhook-system/webhook-system.sql` **и запустить**

**ВАЖНО:** Изменить `edge_function_url` в строке 21 на ваш проект!

### C. Получить API ключи

**1. Settings → API**

**Скопировать:**
- **Project URL:** `https://XXXXXXXXX.supabase.co`
- **anon public key:** `eyJhbGci...` (длинная строка)

**2. Settings → API → JWT Settings**

**Скопировать:**
- **JWT Secret:** (нажать "Show" → скопировать весь текст)

### D. Отключить Email Confirmation

**⚠️ ВАЖНО для Magic Link!**

**1. Authentication → Settings → Sign In / Providers**

**2. Email Provider:**
- Нажать "Edit"
- **Confirm email:** ВЫКЛЮЧИТЬ (toggle OFF)
- Нажать "Save"

**Почему:** Magic Link сам является подтверждением email!

---

## ⚙️ Шаг 9: Подключение плагина к Supabase

### 1. WordPress Admin → Settings → Supabase Bridge

**Заполнить форму:**

**Supabase URL:**
```
https://XXXXXXXXX.supabase.co
```

**Supabase Anon Key:**
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJz...
```

**JWT Secret:**
```
your-super-secret-jwt-key-from-supabase-settings
```

**Thank You Page URL:** (опционально)
```
/thank-you/
```

### 2. Нажать "Save Changes"

**Результат:**
✅ Settings saved successfully

---

## 🧪 Шаг 10: Тестирование аутентификации

### A. Создать Login страницу

**1. Pages → Add New**

**2. Заполнить:**
- **Title:** Login
- **Content:** (добавить Block → Shortcode)
```
[supabase_auth_form]
```

**3. Publish**

**4. Получить URL:**
```
http://localhost:8000/login/
```

### B. Настроить Permalinks

**⚠️ КРИТИЧНО для REST API!**

**1. Settings → Permalinks**

**2. Выбрать:** Post name

**3. Нажать:** Save Changes

**Результат:** REST API endpoints теперь доступны

### C. Тест Magic Link

**1. Открыть:**
```
http://localhost:8000/login/
```

**2. Ввести email:**
```
test@example.com
```

**3. Нажать:** Continue with email

**4. Проверить email:**
- Открыть письмо от Supabase
- Нажать Magic Link

**5. Ожидаемый результат:**
- ✅ Redirect на главную страницу
- ✅ Черная админ-панель WordPress сверху
- ✅ Надпись: "Howdy, test@example.com"
- ✅ Пользователь залогинен!

### D. Тест Google OAuth

**⚠️ Требует настройки Google Cloud Console!**

**1. Настроить Google OAuth в Supabase:**
- Authentication → Providers → Google
- Enable Google provider
- Добавить OAuth credentials

**2. На Login странице:**
- Нажать "Continue with Google"
- Выбрать Google аккаунт
- Разрешить доступ

**3. Ожидаемый результат:**
- ✅ Redirect на главную
- ✅ Пользователь залогинен через Google

---

## ✅ Проверка что все работает

### 1. WordPress Users

**Users → All Users**

**Должны видеть:**
- Нового пользователя с email от Magic Link/OAuth
- Username: автоматически сгенерирован
- Supabase User ID в метаданных

### 2. Supabase Auth Users

**Supabase Dashboard → Authentication → Users**

**Должны видеть:**
- Нового пользователя с тем же email
- Provider: email (Magic Link) или google (OAuth)

### 3. WordPress REST API

**Открыть в браузере:**
```
http://localhost:8000/wp-json/
```

**Должен вернуться JSON** с описанием доступных endpoints

### 4. Supabase Tables

**Supabase Dashboard → Table Editor → wp_user_registrations**

**Должна быть запись:**
- user_id: UUID из auth.users
- user_email: ваш email
- registration_url: /login/
- registered_at: timestamp

---

## 🎉 Готово!

Если все шаги выполнены, у вас теперь есть:

- ✅ WordPress сайт на http://localhost:8000
- ✅ Supabase Auth интеграция
- ✅ Magic Link аутентификация
- ✅ Google OAuth (если настроили)
- ✅ Автоматическое создание WordPress users
- ✅ Логирование регистраций в Supabase

---

## 🐛 Troubleshooting

**Если что-то не работает, см.** [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

**Частые проблемы:**
1. REST API 404 → не настроены permalinks
2. Google OAuth не работает → используется sessionStorage (нужен localStorage)
3. Magic Link не работает → включен "Confirm email" в Supabase
4. JWT verification failed → неправильный JWT Secret

---

## 📚 Следующие шаги

**Детальная документация:**
- [ARCHITECTURE.md](ARCHITECTURE.md) - Как работает система
- [problems/](problems/) - Разбор всех проблем и решений
- [sessions/](sessions/) - Хронология разработки

**Расширение функциональности:**
- Настроить Facebook OAuth
- Настроить webhook в Make.com
- Кастомизировать Thank You страницы

---

**Последнее обновление:** 2025-11-02
**Версия:** 1.0.0
