// Единственная точка доступа к БД. Сейчас — встроенный SQLite (node:sqlite,
// ноль внешних зависимостей). Для перехода на PostgreSQL достаточно заменить
// реализацию функций get/all/run в этом файле — остальной код их не обходит.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const here = dirname(fileURLToPath(import.meta.url));

mkdirSync(config.dataDir, { recursive: true });

const db = new DatabaseSync(join(config.dataDir, 'platform.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

const schema = readFileSync(join(here, 'schema.sql'), 'utf8');
db.exec(schema);

// Миграции для существующих БД: добавление колонок, появившихся после релиза
// (CREATE TABLE IF NOT EXISTS не меняет уже созданные таблицы).
function ensureColumn(table: string, column: string, ddl: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}
ensureColumn('courses', 'meet_url', 'meet_url TEXT');
ensureColumn('users', 'token_version', 'token_version INTEGER NOT NULL DEFAULT 0');

export type Row = Record<string, unknown>;
type Param = string | number | null;

export function get<T = Row>(sql: string, ...params: Param[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

export function all<T = Row>(sql: string, ...params: Param[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}

export function run(sql: string, ...params: Param[]): { lastInsertRowid: number; changes: number } {
  const r = db.prepare(sql).run(...params);
  return { lastInsertRowid: Number(r.lastInsertRowid), changes: Number(r.changes) };
}

export function tx<T>(fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function now(): string {
  return new Date().toISOString();
}
