// Вход через Яндекс ID (OAuth 2.0). Адаптер включается переменными окружения:
//   YANDEX_CLIENT_ID, YANDEX_CLIENT_SECRET — из кабинета https://oauth.yandex.ru
// Redirect URI приложения: <адрес платформы>/api/auth/yandex/callback
// Без ключей маршруты отвечают 404, кнопка на странице входа не показывается.
import { Router, type Request } from 'express';
import { randomBytes } from 'node:crypto';
import { get, run, now } from '../../core/db.js';
import { brand } from '../../config.js';
import { notFound } from '../../core/errors.js';
import { hashPassword } from './passwords.js';
import { parseCookies } from './middleware.js';
import { setSessionCookie } from './routes.js';

const CLIENT_ID = process.env.YANDEX_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.YANDEX_CLIENT_SECRET ?? '';

export const yandexEnabled = CLIENT_ID.length > 0 && CLIENT_SECRET.length > 0;

const STATE_COOKIE = 'oauth_state';

function callbackUrl(req: Request): string {
  // За обратным прокси протокол берётся из X-Forwarded-Proto (trust proxy)
  return `${req.protocol}://${req.get('host')}/api/auth/yandex/callback`;
}

interface YandexProfile {
  id: string;
  default_email?: string;
  first_name?: string;
  last_name?: string;
}

export const yandexRouter = Router();

// Шаг 1: уводим пользователя на страницу согласия Яндекса.
yandexRouter.get('/yandex', (req, res) => {
  if (!yandexEnabled) throw notFound();
  const state = randomBytes(16).toString('hex');
  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 10 * 60 * 1000,
    path: '/',
  });
  const url = new URL('https://oauth.yandex.ru/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', callbackUrl(req));
  url.searchParams.set('state', state);
  res.redirect(url.toString());
});

// Шаг 2: Яндекс вернул код — меняем на токен, читаем профиль, входим.
yandexRouter.get('/yandex/callback', async (req, res) => {
  if (!yandexEnabled) throw notFound();
  const fail = (reason: string) => {
    console.error('Вход через Яндекс не выполнен:', reason);
    res.redirect('/?authError=yandex');
  };

  const code = String(req.query.code ?? '');
  const state = String(req.query.state ?? '');
  const expectedState = parseCookies(req.headers.cookie)[STATE_COOKIE];
  res.clearCookie(STATE_COOKIE, { path: '/' });
  if (!code || !state || state !== expectedState) {
    fail('некорректный state или отсутствует code');
    return;
  }

  // Обмен кода на access_token
  const tokenResponse = await fetch('https://oauth.yandex.ru/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: callbackUrl(req),
    }),
  });
  if (!tokenResponse.ok) {
    fail(`oauth.yandex.ru/token ответил ${tokenResponse.status}`);
    return;
  }
  const { access_token: accessToken } = (await tokenResponse.json()) as { access_token?: string };
  if (!accessToken) {
    fail('в ответе нет access_token');
    return;
  }

  // Профиль пользователя
  const infoResponse = await fetch('https://login.yandex.ru/info?format=json', {
    headers: { Authorization: `OAuth ${accessToken}` },
  });
  if (!infoResponse.ok) {
    fail(`login.yandex.ru/info ответил ${infoResponse.status}`);
    return;
  }
  const profile = (await infoResponse.json()) as YandexProfile;
  const email = profile.default_email?.toLowerCase();
  if (!email) {
    fail('у аккаунта Яндекса нет email (нужно разрешение на доступ к почте)');
    return;
  }

  let user = get<{ id: number; token_version: number }>(
    'SELECT id, token_version FROM users WHERE email = ?',
    email,
  );
  if (!user) {
    if (!brand.features.registration) {
      fail('регистрация отключена, а пользователь не найден');
      return;
    }
    // Пароль не задаётся: вход по паролю станет доступен после смены пароля
    const { lastInsertRowid: id } = run(
      'INSERT INTO users (email, password_hash, last_name, first_name, created_at) VALUES (?, ?, ?, ?, ?)',
      email,
      hashPassword(randomBytes(24).toString('hex')),
      profile.last_name?.trim() || 'Пользователь',
      profile.first_name?.trim() || 'Яндекс',
      now(),
    );
    user = { id, token_version: 0 };
  }
  setSessionCookie(res, user.id, user.token_version);
  res.redirect('/');
});
