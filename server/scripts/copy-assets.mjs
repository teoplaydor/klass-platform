// Копирует не-TS ассеты в dist после сборки tsc.
import { cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
cpSync(join(root, 'src', 'core', 'schema.sql'), join(root, 'dist', 'core', 'schema.sql'));
console.log('Ассеты скопированы в dist');
