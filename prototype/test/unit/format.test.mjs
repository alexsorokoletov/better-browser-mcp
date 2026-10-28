import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffLines } from '../../src/format.ts';
import { filterWithAncestors } from '../../src/controller.ts';
import { parseKey } from '../../src/cdp/keys.ts';

test('diffLines: no change', () => {
  const d = diffLines(['a', 'b'], ['a', 'b']);
  assert.equal(d.changed, false);
});

test('diffLines: added and removed lines with context', () => {
  const prev = ['form:', ' textbox "Email" [e1]', ' button "Go" [e2]', 'footer'];
  const next = ['form:', ' textbox "Email" [e1] = "a@b.c"', ' button "Go" [e2]', ' alert "Saved"', 'footer'];
  const d = diffLines(prev, next);
  assert.equal(d.changed, true);
  assert.equal(d.added, 2);
  assert.equal(d.removed, 1);
  assert.match(d.text, /^- {2}textbox "Email" \[e1\]$/m);
  assert.match(d.text, /^\+ {2}textbox "Email" \[e1\] = "a@b.c"$/m);
  assert.match(d.text, /^\+ {2}alert "Saved"$/m);
  assert.match(d.text, /^ {2}form:$/m, 'keeps a context line');
});

test('diffLines: separate hunks are split by an ellipsis', () => {
  const prev = Array.from({ length: 50 }, (_, i) => `line ${i}`);
  const next = [...prev];
  next[2] = 'changed 2';
  next[40] = 'changed 40';
  const d = diffLines(prev, next);
  assert.equal(d.added, 2);
  assert.match(d.text, /…/);
  assert.ok(d.text.split('\n').length < 12);
});

test('diffLines: large inputs stay fast', () => {
  const prev = Array.from({ length: 5000 }, (_, i) => `row ${i}`);
  const next = prev.slice(100).concat(Array.from({ length: 100 }, (_, i) => `new ${i}`));
  const t0 = performance.now();
  const d = diffLines(prev, next);
  assert.ok(performance.now() - t0 < 500);
  assert.equal(d.added, 100);
  assert.equal(d.removed, 100);
});

test('filterWithAncestors keeps parent chain', () => {
  const lines = ['main:', ' list:', '  link "A" [e1]', '  link "B" [e2]', ' button "C" [e3]'];
  assert.deepEqual(filterWithAncestors(lines, '"b"'), ['main:', ' list:', '  link "B" [e2]']);
});

test('parseKey', () => {
  assert.deepEqual(parseKey('Enter'), { modifiers: 0, key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' });
  const k = parseKey('Control+a');
  assert.equal(k.modifiers, 2);
  assert.equal(k.text, undefined);
  assert.equal(parseKey('Shift+Tab').modifiers, 8);
  assert.throws(() => parseKey('Hyper+x'));
});

import { makeAllow, checkUploadPaths } from '../../src/controller.ts';
import { writeFileSync, mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('allowlist fails closed', () => {
  const ok = makeAllow(['http://127.0.0.1:*', '*.example.com']);
  assert.equal(ok('http://127.0.0.1:4777/x'), true);
  assert.equal(ok('https://docs.example.com/a'), true);
  assert.equal(ok('https://evil.com/'), false);
  assert.equal(ok('data:text/html,<script>1</script>'), false);
  assert.equal(ok('javascript:alert(1)'), false);
  assert.equal(ok('not a url'), false);
  assert.equal(ok('about:blank'), true);
  assert.equal(makeAllow(null), null);
});

test('upload paths limited to roots, symlinks resolved', () => {
  const root = mkdtempSync(join(tmpdir(), 'up-root-'));
  const f = join(root, 'a.txt');
  writeFileSync(f, 'x');
  assert.equal(checkUploadPaths([f], root).length, 1);
  assert.throws(() => checkUploadPaths(['/etc/hosts'], root), /outside/);
  const link = join(root, 'link');
  symlinkSync('/etc/hosts', link);
  assert.throws(() => checkUploadPaths([link], root), /outside/);
  assert.throws(() => checkUploadPaths([join(root, 'missing')], root), /no such file/);
  const dot = join(root, '.env');
  writeFileSync(dot, 'SECRET=1');
  assert.throws(() => checkUploadPaths([dot], root), /hidden/);
});
