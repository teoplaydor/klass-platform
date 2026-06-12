// Маршруты аутентификации: регистрация, вход, выход, профиль.
import { Router } from 'express';
import { brand } from '../../config.js';
import { get, run, now } from '../../core/db.js';
import { badRequest, conflict, forbidden, unauthorized } from '../../core/errors.js';
import { str, optStr } from '../../core/validate.js';
import { hashPassword, verifyPassword } from './passwords.js';
import { issueToken } from './tokens.js';
import { COOKIE_NAME, currentUser, requireAuth } from './middleware.js';
import type { Response } from 'express';

export const authRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Фиктивный хэш для выравнивания времени ответа при несуществующем email
// (защита от перечисления пользователей по таймингу).
const DUMMY_HASH = hashPassword('dummy-timing-equalizer');

function setSessionCookie(res: Response, userId: number, tokenVersion: number): void {
  res.cookie(COOKIE_NAME, issueToken(userId, tokenVersion), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 30,
    path: '/',
  });
}

function publicUser(id: number) {
  return get(
    'SELECT id, email, last_name, first_name, middle_name, global_role, created_at FROM users WHERE id = ?',
    id,
  );
}

authRouter.post('/register', (req, res) => {
  if (!brand.features.registration) throw forbidden('Регистрация отключена администратором');
  const email = str(req.body, 'email', { max: 254 }).toLowerCase();
  if (!EMAIL_RE.test(email)) throw badRequest('Некорректный email');
  const password = str(req.body, 'password', { min: 8, max: 128 });
  const lastName = str(req.body, 'lastName', { max: 100 });
  const firstName = str(req.body, 'firstName', { max: 100 });
  const middleName = optStr(req.body, 'middleName', { max: 100 });

  if (get('SELECT id FROM users WHERE email = ?', email)) {
    throw conflict('Пользователь с таким email уже зарегистрирован');
  }
  const { lastInsertRowid: id } = run(
    'INSERT INTO users (email, password_hash, last_name, first_name, middle_name, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    email,
    hashPassword(password),
    lastName,
    firstName,
    middleName,
    now(),
  );
  setSessionCookie(res, id, 0);
  res.status(201).json({ user: publicUser(id) });
});

authRouter.post('/login', (req, res) => {
  const email = str(req.body, 'email', { max: 254 }).toLowerCase();
  const password = str(req.body, 'password', { max: 128 });
  const row = get<{ id: number; password_hash: string; token_version: number }>(
    'SELECT id, password_hash, token_version FROM users WHERE email = ?',
    email,
  );
  // Проверка выполняется всегда (по фиктивному хэшу при отсутствии пользователя),
  // чтобы время ответа не раскрывало, зарегистрирован ли email
  const valid = verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !valid) {
    throw unauthorized('Неверный email или пароль');
  }
  setSessionCookie(res, row.id, row.token_version);
  res.json({ user: publicUser(row.id) });
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

authRouter.get('/me', (req, res) => {
  if (!req.user) {
    res.json({ user: null });
    return;
  }
  res.json({ user: publicUser(req.user.id) });
});

authRouter.patch('/profile', requireAuth, (req, res) => {
  const user = currentUser(req);
  const lastName = str(req.body, 'lastName', { max: 100 });
  const firstName = str(req.body, 'firstName', { max: 100 });
  const middleName = optStr(req.body, 'middleName', { max: 100 });
  run(
    'UPDATE users SET last_name = ?, first_name = ?, middle_name = ? WHERE id = ?',
    lastName,
    firstName,
    middleName,
    user.id,
  );
  res.json({ user: publicUser(user.id) });
});

authRouter.post('/change-password', requireAuth, (req, res) => {
  const user = currentUser(req);
  const oldPassword = str(req.body, 'oldPassword', { max: 128 });
  const newPassword = str(req.body, 'newPassword', { min: 8, max: 128 });
  const row = get<{ password_hash: string; token_version: number }>(
    'SELECT password_hash, token_version FROM users WHERE id = ?',
    user.id,
  );
  if (!row || !verifyPassword(oldPassword, row.password_hash)) {
    throw badRequest('Текущий пароль указан неверно');
  }
  // Инкремент версии отзывает все ранее выданные сессии на других устройствах
  const newVersion = row.token_version + 1;
  run(
    'UPDATE users SET password_hash = ?, token_version = ? WHERE id = ?',
    hashPassword(newPassword), newVersion, user.id,
  );
  setSessionCookie(res, user.id, newVersion);
  res.json({ ok: true });
});
