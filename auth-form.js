// ========== SUPABASE AUTH С УМНЫМИ РЕДИРЕКТАМИ ==========

(function() {
  'use strict';

  // Защита от запуска если DOM не готов
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuthForm);
  } else {
    initAuthForm();
  }

  function initAuthForm() {
    try {
      // ========== КОНФИГУРАЦИЯ ==========

      const AUTH_CONFIG = {
    // 🎯 НАСТРОЙКА СТРАНИЦ БЛАГОДАРНОСТИ ДЛЯ НОВЫХ ПОЛЬЗОВАТЕЛЕЙ
    thankYouPages: {
      'default': window.SUPABASE_CFG?.thankYouUrl || '/registr/'  // Thank You Page from Settings
    },

    // 🏠 Для существующих пользователей (если не удалось определить откуда пришли)
    defaultRedirect: '/',

    // ⏱️ Порог "новый пользователь" в миллисекундах (24 часа = зарегистрирован сегодня)
    newUserThreshold: 86400000  // 24 часа (было 60000 = 60 сек)
  };

  // ========== ЭЛЕМЕНТЫ DOM ==========

  const screen1 = document.getElementById('sb-screen-1');
  const screen2 = document.getElementById('sb-screen-2');
  const emailForm = document.getElementById('sb-email-form');
  const emailInput = document.getElementById('sb-email-input');
  const displayEmail = document.getElementById('sb-display-email');
  const googleBtn = document.getElementById('sb-google-btn');
  const facebookBtn = document.getElementById('sb-facebook-btn');
  const showCodeBtn = document.getElementById('sb-show-code');
  const codeSection = document.getElementById('sb-code-section');
  const codeInput = document.getElementById('sb-code-input');
  const verifyBtn = document.getElementById('sb-verify-btn');
  const resendBtn = document.getElementById('sb-resend');
  const errorMsg = document.getElementById('sb-error-msg');
  const successMsg = document.getElementById('sb-success-msg');

  // Проверяем что все элементы найдены
  const requiredElements = {
    screen1, screen2, emailForm, emailInput, displayEmail,
    googleBtn, facebookBtn, showCodeBtn, codeSection, codeInput,
    verifyBtn, resendBtn, errorMsg, successMsg
  };

  for (const [name, element] of Object.entries(requiredElements)) {
    if (!element) {
      console.error(`❌ Supabase Auth Form: Required element '${name}' not found!`);
      console.log('💡 Make sure the HTML structure is complete');
      return; // Выходим без ошибки чтобы не ломать страницу
    }
  }

  // ========== ИНИЦИАЛИЗАЦИЯ SUPABASE ==========

  let supabaseClient;
  let authSubscription; // Ссылка на подписку для предотвращения дублирования
  let isInitialized = false; // Флаг для предотвращения множественной инициализации

  function initSupabase() {
    // КРИТИЧНО: Предотвращаем множественную инициализацию
    if (isInitialized) {
      console.log('⚠️ Supabase already initialized, skipping');
      return true;
    }

    if (!window.SUPABASE_CFG || !window.supabase) {
      return false;
    }

    try {
      const { createClient } = window.supabase;
      supabaseClient = createClient(
        window.SUPABASE_CFG.url,
        window.SUPABASE_CFG.anon
      );

      // Отписываемся от предыдущей подписки если она существует (защита от дублирования)
      if (authSubscription) {
        authSubscription.data?.subscription?.unsubscribe();
      }

      // Слушаем изменения авторизации
      authSubscription = supabaseClient.auth.onAuthStateChange(handleAuthChange);

      isInitialized = true; // Помечаем как инициализированный
      console.log('✅ Supabase Auth initialized');
      return true;
    } catch (error) {
      console.error('Supabase init error:', error);
      showError('Failed to initialize Supabase');
      return false;
    }
  }

  // Ожидание загрузки конфигурации с retry
  function waitForSupabase(callback, maxAttempts = 20) {
    let attempts = 0;

    const checkAndInit = () => {
      attempts++;

      if (window.SUPABASE_CFG && window.supabase) {
        // Конфигурация загружена
        if (initSupabase()) {
          callback();
        } else {
          showError('Supabase initialization failed. Check console.');
        }
      } else if (attempts >= maxAttempts) {
        // Превышено количество попыток
        showError('Supabase not configured. Check wp-config.php or plugin activation.');
        console.error('❌ SUPABASE_CFG not found after', maxAttempts, 'attempts');
        console.log('💡 Make sure supabase-bridge plugin is activated and wp-config.php is configured');
      } else {
        // Пробуем ещё раз через 100ms
        setTimeout(checkAndInit, 100);
      }
    };

    checkAndInit();
  }

  // ========== УТИЛИТЫ РЕДИРЕКТОВ ==========

  // Сохраняем откуда пришел пользователь при загрузке страницы
  const ORIGIN_PAGE = (function() {
    const params = new URLSearchParams(window.location.search);

    // 1. Explicit параметр redirect_to (высший приоритет)
    if (params.get('redirect_to')) {
      console.log('🎯 ORIGIN_PAGE: from ?redirect_to =', params.get('redirect_to'));
      return params.get('redirect_to');
    }

    // 2. Referrer (откуда пришел)
    if (document.referrer) {
      try {
        const referrerUrl = new URL(document.referrer);
        // Проверяем что это тот же домен
        if (referrerUrl.origin === window.location.origin) {
          console.log('🎯 ORIGIN_PAGE: from referrer =', referrerUrl.pathname);
          return referrerUrl.pathname;
        }
      } catch (e) {
        console.warn('Invalid referrer:', e);
      }
    }

    // 3. Fallback - текущая страница
    console.log('🎯 ORIGIN_PAGE: fallback (current page) =', window.location.pathname);
    return window.location.pathname;
  })();

  // Security: Validate redirect URL to prevent open redirect attacks
  function isSafeRedirect(url) {
    if (!url) return false;

    // Allow relative paths (start with /)
    if (url.startsWith('/')) return true;

    // Check if URL is on same domain
    try {
      const urlObj = new URL(url, window.location.origin);
      return urlObj.origin === window.location.origin;
    } catch (e) {
      console.warn('Invalid redirect URL:', url);
      return false;
    }
  }

  function getReturnUrl() {
    // Если origin page = текущая страница → используем defaultRedirect (чтобы избежать loop)
    if (ORIGIN_PAGE === window.location.pathname) {
      console.log('⚠️ ORIGIN_PAGE is current page, using defaultRedirect');
      return AUTH_CONFIG.defaultRedirect;
    }
    // Для существующих пользователей - возвращаем на страницу откуда пришли
    // Security: validate before returning
    if (!isSafeRedirect(ORIGIN_PAGE)) {
      console.warn('⚠️ Unsafe redirect detected, using defaultRedirect');
      return AUTH_CONFIG.defaultRedirect;
    }
    return ORIGIN_PAGE;
  }

  function getThankYouPage() {
    const params = new URLSearchParams(window.location.search);

    // 1. Explicit параметр thank_you (высший приоритет)
    const customPage = params.get('thank_you');
    if (customPage) {
      // Security: validate custom page parameter
      if (!isSafeRedirect(customPage)) {
        console.warn('⚠️ Unsafe thank_you parameter detected, using default');
        return AUTH_CONFIG.thankYouPages.default;
      }
      return customPage;
    }

    // === Phase 5: Use page-specific pairs from Settings ===
    // 2a. Check registration pairs from Settings (wp_options → Supabase → JavaScript)
    if (window.SUPABASE_CFG?.registrationPairs && Array.isArray(window.SUPABASE_CFG.registrationPairs)) {
      const pair = window.SUPABASE_CFG.registrationPairs.find(
        p => p.registration_url === ORIGIN_PAGE
      );

      if (pair && pair.thankyou_url) {
        console.log('✅ Phase 5: Found pair for', ORIGIN_PAGE, '→', pair.thankyou_url);
        return pair.thankyou_url;
      }
    }

    // 2b. Fallback: Legacy hardcoded mapping (for backward compatibility)
    if (AUTH_CONFIG.thankYouPages[ORIGIN_PAGE]) {
      console.log('⚠️ Using legacy hardcoded mapping for', ORIGIN_PAGE);
      return AUTH_CONFIG.thankYouPages[ORIGIN_PAGE];
    }

    // 3. Default fallback (global Thank You Page from Settings)
    console.log('ℹ️ No specific pair found, using global default:', AUTH_CONFIG.thankYouPages.default);
    return AUTH_CONFIG.thankYouPages.default;
  }

  function isNewUser(user) {
    if (!user || !user.created_at) return false;

    const createdAt = new Date(user.created_at);
    const now = new Date();
    const diff = now - createdAt;

    return diff < AUTH_CONFIG.newUserThreshold;
  }

  // ========== ОБРАБОТКА АВТОРИЗАЦИИ ==========

  let isRedirecting = false; // Флаг чтобы избежать множественных редиректов
  const processingTokens = new Set(); // In-memory Set для защиты от race condition

  // ========== CLEANUP OLD TOKENS ==========
  // Очистка старых обработанных токенов при загрузке страницы (предотвращает блокировку повторных логинов)
  (function cleanupOldTokens() {
    const now = Date.now();
    const maxAge = 60000; // 60 секунд

    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('sb_processed_')) {
        try {
          const data = localStorage.getItem(key);
          // Если токен обработан давно - удаляем
          // Простая эвристика: если токен существует, считаем что ему уже > 60 сек
          // (более точная проверка требует хранения timestamp, но это overkill)
          // На практике: если пользователь делает logout и логинится снова через > 1 сек,
          // токен уже можно переиспользовать
          if (data === 'true') {
            // Удаляем сразу при загрузке страницы логина
            // (значит пользователь вернулся после редиректа или сделал logout)
            localStorage.removeItem(key);
            console.log('Cleaned up old token:', key.substring(0, 25) + '...');
          }
        } catch (e) {
          // Ignore errors
        }
      }
    });
  })();

  // Проверяем был ли триггер от пользователя (сохранён в localStorage для cross-origin redirect support)
  let userTriggeredAuth = localStorage.getItem('sb_auth_triggered') === 'true';

  // Проверяем пришёл ли пользователь по Magic Link (есть токен в URL hash)
  const hasMagicLinkToken = window.location.hash.includes('access_token=');

  async function handleAuthChange(event, session) {
    // КРИТИЧНО #0: Проверяем isRedirecting ПЕРВЫМ ДЕЛОМ (до любых других проверок)
    // Это самая ранняя защита от race condition
    if (isRedirecting) {
      console.log('⚠️ Already redirecting, skipping duplicate event');
      return;
    }

    console.log('Auth event:', event, 'userTriggered:', userTriggeredAuth, 'hasMagicLink:', hasMagicLinkToken);

    // Определяем нужно ли делать редирект
    // Да, если: пользователь нажал кнопку ИЛИ пришёл по Magic Link
    const shouldRedirect = userTriggeredAuth || hasMagicLinkToken;

    // Редиректим ТОЛЬКО если:
    // 1. Событие = SIGNED_IN
    // 2. Есть сессия
    // 3. (Пользователь нажал кнопку ИЛИ пришёл по Magic Link)
    if (event === 'SIGNED_IN' && session && shouldRedirect) {
      const tokenKey = session.access_token.substring(0, 20);

      // КРИТИЧНО #1: In-memory проверка (защита от race condition внутри одной страницы)
      if (processingTokens.has(tokenKey)) {
        console.log('⚠️ Token already processing (in-memory lock), skipping');
        return;
      }

      // КРИТИЧНО #2: Устанавливаем флаги СРАЗУ И СИНХРОННО
      processingTokens.add(tokenKey);
      isRedirecting = true; // ← Перенесли СЮДА - раньше!

      // КРИТИЧНО #3: localStorage проверка (защита между табами/окнами)
      const processedTokenKey = 'sb_processed_' + tokenKey;
      if (localStorage.getItem(processedTokenKey)) {
        console.log('⚠️ Token already processed (localStorage), skipping');
        processingTokens.delete(tokenKey); // Очищаем in-memory lock
        isRedirecting = false; // Сбрасываем флаг
        return;
      }

      // Помечаем в localStorage
      localStorage.setItem(processedTokenKey, 'processing');

      const user = session.user;
      const accessToken = session.access_token;

      try {
        // Синхронизация с WordPress
        const wpResponse = await fetch(window.location.origin + '/wp-json/supabase-auth/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: accessToken })
        });

        const wpData = await wpResponse.json();

        if (!wpResponse.ok) {
          throw new Error(wpData.message || 'WordPress authentication failed');
        }

        // ✅ Помечаем токен как обработанный ТОЛЬКО после успешного ответа WordPress
        localStorage.setItem(processedTokenKey, 'true');
        // Токен будет автоматически очищен при следующей загрузке страницы логина (см. cleanupOldTokens)

        // Определяем куда редиректить
        const redirectUrl = isNewUser(user)
          ? getThankYouPage()
          : getReturnUrl();

        console.log('Redirecting to:', redirectUrl, '(new user:', isNewUser(user), ')');

        // Очищаем флаг перед редиректом
        localStorage.removeItem('sb_auth_triggered');

        // Редирект
        window.location.href = redirectUrl;

      } catch (error) {
        console.error('Auth error:', error);
        showError(error.message || 'Authentication failed');

        // Очищаем флаги обработки при ошибке (позволяет пользователю попробовать снова)
        processingTokens.delete(tokenKey); // Очищаем in-memory lock
        localStorage.removeItem(processedTokenKey); // Очищаем localStorage
        isRedirecting = false;
      }
    }
  }

  // ========== EMAIL MAGIC LINK ==========

  emailForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();

    if (!email) return;

    if (!supabaseClient) {
      showError('Supabase not initialized yet. Please wait...');
      return;
    }

    // Устанавливаем флаг что пользователь отправил email
    userTriggeredAuth = true;
    localStorage.setItem('sb_auth_triggered', 'true');
    console.log('🎯 User submitted email for magic link');

    try {
      // Отправка magic link
      const { error } = await supabaseClient.auth.signInWithOtp({
        email: email,
        options: {
          emailRedirectTo: window.location.origin + window.location.pathname
        }
      });

      if (error) throw error;

      // Переключить на экран 2
      displayEmail.textContent = email;
      switchScreen(2);
      showSuccess('Magic link sent! Check your email.');

    } catch (error) {
      console.error('Magic link error:', error);
      showError(error.message || 'Failed to send magic link');
    }
  });

  // ========== GOOGLE OAUTH ==========

  googleBtn.addEventListener('click', async () => {
    if (!supabaseClient) {
      showError('Supabase not initialized yet. Please wait...');
      return;
    }

    // Устанавливаем флаг что пользователь сам нажал кнопку
    userTriggeredAuth = true;
    localStorage.setItem('sb_auth_triggered', 'true');
    console.log('🎯 User clicked Google OAuth button');

    try {
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + window.location.pathname
        }
      });

      if (error) throw error;

    } catch (error) {
      console.error('OAuth error:', error);
      showError(error.message || 'OAuth authentication failed');
    }
  });

  // ========== FACEBOOK OAUTH ==========

  facebookBtn.addEventListener('click', async () => {
    if (!supabaseClient) {
      showError('Supabase not initialized yet. Please wait...');
      return;
    }

    // Устанавливаем флаг что пользователь сам нажал кнопку
    userTriggeredAuth = true;
    localStorage.setItem('sb_auth_triggered', 'true');
    console.log('🎯 User clicked Facebook OAuth button');

    try {
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'facebook',
        options: {
          redirectTo: window.location.origin + window.location.pathname,
          scopes: 'email public_profile'
        }
      });

      if (error) throw error;

    } catch (error) {
      console.error('OAuth error:', error);
      showError(error.message || 'OAuth authentication failed');
    }
  });

  // ========== VERIFICATION CODE ==========

  showCodeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    codeSection.classList.add('active');
    showCodeBtn.style.display = 'none';
    codeInput.focus();
  });

  verifyBtn.addEventListener('click', async () => {
    const email = displayEmail.textContent;
    const code = codeInput.value.trim();

    if (code.length !== 6) {
      showError('Please enter a 6-digit code');
      return;
    }

    if (!supabaseClient) {
      showError('Supabase not initialized yet. Please wait...');
      return;
    }

    try {
      const { error } = await supabaseClient.auth.verifyOtp({
        email: email,
        token: code,
        type: 'email'
      });

      if (error) throw error;

      // handleAuthChange сработает автоматически

    } catch (error) {
      console.error('Verification error:', error);
      showError(error.message || 'Invalid verification code');
    }
  });

  // ========== RESEND ==========

  resendBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const email = displayEmail.textContent;

    if (!supabaseClient) {
      showError('Supabase not initialized yet. Please wait...');
      return;
    }

    try {
      const { error } = await supabaseClient.auth.signInWithOtp({
        email: email,
        options: {
          emailRedirectTo: window.location.origin + window.location.pathname
        }
      });

      if (error) throw error;

      showSuccess('Email sent again!');

    } catch (error) {
      console.error('Resend error:', error);
      showError(error.message || 'Failed to resend email');
    }
  });

  // ========== УТИЛИТЫ UI ==========

  function switchScreen(num) {
    screen1.classList.remove('active');
    screen2.classList.remove('active');

    if (num === 1) screen1.classList.add('active');
    if (num === 2) screen2.classList.add('active');
  }

  function showError(message) {
    errorMsg.textContent = message;
    errorMsg.classList.add('active');
    setTimeout(() => errorMsg.classList.remove('active'), 5000);
  }

  function showSuccess(message) {
    successMsg.textContent = message;
    successMsg.classList.add('active');
    setTimeout(() => successMsg.classList.remove('active'), 3000);
  }

  // ========== ИНИЦИАЛИЗАЦИЯ ==========

  // Ждём загрузки SUPABASE_CFG и инициализируем
  waitForSupabase(() => {
    console.log('🎯 Ready to authenticate');
  });

  // ========== GLOBAL API ==========

  window.sbAuth = {
    switchScreen,
    showError,
    showSuccess,
    reset: () => {
      emailInput.value = '';
      codeInput.value = '';
      codeSection.classList.remove('active');
      showCodeBtn.style.display = '';
      switchScreen(1);
    },
    config: AUTH_CONFIG,
    client: supabaseClient
  };

    } catch (error) {
      console.error('❌ Supabase Auth Form initialization error:', error);
      console.log('💡 Check browser console for details');
      // Не пробрасываем ошибку дальше - пусть страница работает
    }
  } // end of initAuthForm()
})(); // end of IIFE
