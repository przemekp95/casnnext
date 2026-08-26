import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

for (const dir of [resolve(root, 'tmp'), resolve(root, 'tmp/next-cache')]) {
  mkdirSync(dir, { recursive: true });
}
