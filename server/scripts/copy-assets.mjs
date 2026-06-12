// Копирует не-TS ассеты в dist после сборки tsc.
// Чтение + запись вместо cpSync: надёжно перезаписывает файлы на Windows.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const targetDir = join(root, 'dist', 'core');
mkdirSync(targetDir, { recursive: true });
writeFileSync(join(targetDir, 'schema.sql'), readFileSync(join(root, 'src', 'core', 'schema.sql')));
console.log('Ассеты скопированы в dist');
