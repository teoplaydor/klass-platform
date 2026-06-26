// Минимальная валидация входных данных без внешних зависимостей.
import { badRequest } from './errors.js';

type Body = Record<string, unknown>;

export function str(body: Body, key: string, opts: { max?: number; min?: number } = {}): string {
  const v = body[key];
  if (typeof v !== 'string') throw badRequest(`Поле «${key}» обязательно`);
  const t = v.trim();
  if (t.length < (opts.min ?? 1)) throw badRequest(`Поле «${key}» не может быть пустым`);
  if (t.length > (opts.max ?? 10000)) throw badRequest(`Поле «${key}» слишком длинное`);
  return t;
}

export function optStr(body: Body, key: string, opts: { max?: number } = {}): string | null {
  const v = body[key];
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string') throw badRequest(`Поле «${key}» должно быть строкой`);
  if (v.length > (opts.max ?? 10000)) throw badRequest(`Поле «${key}» слишком длинное`);
  return v.trim() || null;
}

export function optNum(body: Body, key: string, opts: { min?: number; max?: number } = {}): number | null {
  const v = body[key];
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw badRequest(`Поле «${key}» должно быть числом`);
  if (opts.min !== undefined && n < opts.min) throw badRequest(`Поле «${key}»: минимум ${opts.min}`);
  if (opts.max !== undefined && n > opts.max) throw badRequest(`Поле «${key}»: максимум ${opts.max}`);
  return n;
}

export function oneOf<T extends string>(body: Body, key: string, values: readonly T[]): T {
  const v = body[key];
  if (typeof v !== 'string' || !values.includes(v as T)) {
    throw badRequest(`Поле «${key}» должно быть одним из: ${values.join(', ')}`);
  }
  return v as T;
}

export function optOneOf<T extends string>(body: Body, key: string, values: readonly T[]): T | null {
  const v = body[key];
  if (v === undefined || v === null || v === '') return null;
  return oneOf(body, key, values);
}

// Дата в ISO 8601 либо null.
export function optDate(body: Body, key: string): string | null {
  const v = body[key];
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) {
    throw badRequest(`Поле «${key}» должно быть датой в формате ISO 8601`);
  }
  return new Date(v).toISOString();
}

export function idParam(value: string, name = 'id'): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw badRequest(`Некорректный параметр «${name}»`);
  return n;
}
