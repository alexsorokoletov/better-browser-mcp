// Entry shim: Node 24 `node --test fixtures/test` resolves the directory as a module
// (it does not expand it), so this file loads every *.test.mjs next to it.
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = new URL('./', import.meta.url);
for (const f of readdirSync(fileURLToPath(dir)).filter((n) => n.endsWith('.test.mjs')).sort()) {
  await import(new URL(f, dir).href);
}
