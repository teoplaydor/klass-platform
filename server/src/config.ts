// Конфигурация сервера. Источники: brand.config.json (бренд и фичефлаги,
// единая точка кастомизации покупателем) и переменные окружения (среда).
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';

export interface BrandConfig {
  product: {
    name: string;
    shortName: string;
    tagline: string;
    company: string;
    supportEmail: string;
    logoText: string;
  };
  theme: {
    colorPrimary: string;
    colorPrimaryHover: string;
    colorAccent: string;
    colorDanger: string;
    fontFamily: string;
    radius: string;
    courseColors: Record<string, string>;
  };
  features: Record<string, boolean>;
  limits: {
    maxUploadSizeMb: number;
    maxAttachmentsPerPost: number;
  };
}

function findUp(file: string, from: string): string {
  let dir = resolve(from);
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, file);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Не найден ${file} (поиск от ${from})`);
}

const brandPath = findUp('brand.config.json', process.cwd());
export const brand: BrandConfig = JSON.parse(readFileSync(brandPath, 'utf8'));

const rootDir = dirname(brandPath);
const dataDir = process.env.DATA_DIR ?? join(rootDir, 'server', 'data');
mkdirSync(dataDir, { recursive: true });

// Секрет подписи сессий: из окружения (продакшен) или автосгенерированный
// и сохранённый в data/ (разработка), чтобы сессии переживали перезапуск.
function loadSecret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const secretFile = join(dataDir, 'session.secret');
  if (existsSync(secretFile)) return readFileSync(secretFile, 'utf8').trim();
  const secret = randomBytes(32).toString('hex');
  writeFileSync(secretFile, secret, 'utf8');
  return secret;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  rootDir,
  dataDir,
  uploadsDir: join(dataDir, 'uploads'),
  sessionSecret: loadSecret(),
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS ?? 30),
  webDistDir: join(rootDir, 'web', 'dist'),
};

mkdirSync(config.uploadsDir, { recursive: true });
