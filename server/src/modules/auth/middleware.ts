// Промежуточный слой аутентификации: читает cookie, кладёт пользователя в req.user.
import type { Request, Response, NextFunction } from 'express';
import { get } from '../../core/db.js';
import { unauthorized } from '../../core/errors.js';
import { verifyToken } from './tokens.js';

export interface SessionUser {
  id: number;
  email: string;
  last_name: string;
  first_name: string;
  middle_name: string | null;
  global_role: 'USER' | 'ADMIN';
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: SessionUser;
  }
}

export const COOKIE_NAME = 'session';

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

// Подгружает пользователя, если cookie валидна; не требует входа.
export function attachUser(req: Request, _res: Response, next: NextFunction): void {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      const user = get<SessionUser & { token_version: number }>(
        'SELECT id, email, last_name, first_name, middle_name, global_role, token_version FROM users WHERE id = ?',
        payload.uid,
      );
      // Токены, выпущенные до смены пароля, недействительны
      if (user && user.token_version === payload.ver) {
        const { token_version, ...sessionUser } = user;
        req.user = sessionUser;
      }
    }
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) throw unauthorized();
  next();
}

// Возвращает пользователя или бросает 401 — для использования внутри обработчиков.
export function currentUser(req: Request): SessionUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
