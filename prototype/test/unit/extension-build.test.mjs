import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('each rebuild gets a new display version while unchanged extension content keeps its hash', () => {
  const out = mkdtempSync(join(tmpdir(), 'bbm-build-test-'));
  const source = new URL('../../extension/manifest.json', import.meta.url);
  const original = readFileSync(source, 'utf8');
  const build = () => {
    const log = execFileSync(process.execPath, [fileURLToPath(new URL('../../scripts/build-extension.ts', import.meta.url)), '--out', out], {
      encoding: 'utf8',
    });
    const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
    assert.ok(log.includes(manifest.version_name));
    assert.equal(manifest.version, JSON.parse(original).version);
    assert.match(manifest.version_name, /^\d+\.\d+\.\d+ \(\d{4}-\d{2}-\d{2}T[\d:.]+Z; [a-f0-9]{12}\)$/);
    return manifest.version_name;
  };
  try {
    const first = build();
    const second = build();
    assert.notEqual(first, second);
    assert.equal(first.split('; ')[1], second.split('; ')[1]);
    assert.equal(readFileSync(source, 'utf8'), original);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
