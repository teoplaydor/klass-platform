// Сессионные токены: подписанный HMAC-SHA256 пейлоад { uid, exp }.
// Минимальный аналог JWT без внешних зависимостей. Токен живёт в httpOnly-cookie.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../../config.js';

interface Payload {
  uid: number;
  exp: number; // unix-время в секундах
  ver: number; // версия токенов пользователя: смена пароля отзывает старые сессии
}

function sign(data: string): string {
  return createHmac('sha256', config.sessionSecret).update(data).digest('base64url');
}

export function issueToken(userId: number, tokenVersion: number): string {
  const payload: Payload = {
    uid: userId,
    exp: Math.floor(Date.now() / 1000) + config.sessionTtlDays * 24 * 3600,
    ver: tokenVersion,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function verifyToken(token: string): { uid: number; ver: number } | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as Payload;
    if (typeof payload.uid !== 'number' || payload.exp < Date.now() / 1000) return null;
    return { uid: payload.uid, ver: payload.ver ?? 0 };
  } catch {
    return null;
  }
}
