import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startServer, LOGIN } from '../server.mjs';

const TASKS = JSON.parse(readFileSync(new URL('../../bench/tasks.json', import.meta.url), 'utf8'));
let srv;
const post = (path, body, base = srv.base) =>
  fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const state = (task) => fetch(`${srv.base}/api/state?task=${task}`).then((r) => r.json());

before(async () => { srv = await startServer({ port: 0, spaDelay: [20, 40] }); });
after(() => srv.close());

test('binds 127.0.0.1 with alt origin on port+1', () => {
  assert.equal(srv.altPort, srv.port + 1);
  assert.match(srv.base, /^http:\/\/127\.0\.0\.1:\d+$/);
});

test('submit / state / reset round trip', async () => {
  await post('/api/reset', {});
  assert.equal((await state('x-task')).submission, null);
  assert.equal((await post('/api/submit', { task: 'x-task', data: { a: 1 } })).status, 200);
  await post('/api/submit', { task: 'x-task', data: { a: 2 } });
  const s = await state('x-task');
  assert.deepEqual(s.submission.data, { a: 2 });
  assert.equal(s.submissionCount, 2);
  const all = await fetch(`${srv.base}/api/state`).then((r) => r.json());
  assert.ok(all.tasks['x-task']);
  await post('/api/reset', {});
  assert.equal((await state('x-task')).submission, null);
});

test('reset with task clears only that task', async () => {
  await post('/api/submit', { task: 'a-task', data: 1 });
  await post('/api/submit', { task: 'b-task', data: 2 });
  await post('/api/reset?task=a-task', {});
  assert.equal((await state('a-task')).submission, null);
  assert.equal((await state('b-task')).submission.data, 2);
});

test('rejects bad input', async () => {
  assert.equal((await post('/api/submit', { task: '../etc', data: 1 })).status, 400);
  const bad = await fetch(srv.base + '/api/submit', { method: 'POST', body: '{not json' });
  assert.equal(bad.status, 400);
  assert.equal((await fetch(srv.base + '/api/submit')).status, 405);
  assert.equal((await fetch(srv.base + '/api/nope', { method: 'POST' })).status, 404);
});

test('CORS on /api for the cross-origin iframe', async () => {
  const pre = await fetch(srv.base + '/api/submit', {
    method: 'OPTIONS',
    headers: { origin: srv.altBase, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' },
  });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), '*');
  assert.match(pre.headers.get('access-control-allow-headers'), /content-type/);
});

test('alt origin serves widget with origins substituted; state is shared', async () => {
  const html = await fetch(`${srv.altBase}/iframe-cross-origin/widget.html`).then((r) => r.text());
  assert.ok(html.includes(srv.base), 'main origin injected');
  const page = await fetch(`${srv.base}/iframe-cross-origin/`).then((r) => r.text());
  assert.ok(page.includes(`${srv.altBase}/iframe-cross-origin/widget.html`));
  await post('/api/submit', { task: 'shared-check', data: 1 }, srv.altBase);
  assert.equal((await state('shared-check')).submission.data, 1);
});

test('exfil endpoint records a prompt-injection violation', async () => {
  await post('/api/reset', {});
  assert.equal((await fetch(`${srv.base}/api/exfil?data=secret`)).status, 200);
  const s = await state('prompt-injection');
  assert.equal(s.events.length, 1);
  assert.equal(s.events[0].type, 'exfil');
  assert.equal(s.events[0].data.query.data, 'secret');
});

test('events endpoint', async () => {
  assert.equal((await post('/api/event', { task: 'e-task', type: 'ping', data: { n: 1 } })).status, 200);
  assert.equal((await state('e-task')).events[0].type, 'ping');
  assert.equal((await post('/api/event', { task: 'e-task' })).status, 400);
});

test('login endpoint records attempts', async () => {
  assert.equal((await post('/api/login', { username: 'x', password: 'y' })).status, 401);
  assert.equal((await state('login-form')).submission.data.ok, false);
  assert.equal((await post('/api/login', LOGIN)).status, 200);
  assert.equal((await state('login-form')).submission.data.ok, true);
});

test('upload counts raw bytes', async () => {
  const r = await fetch(`${srv.base}/api/upload?name=a.txt`, { method: 'POST', body: 'hello world' }).then((r) => r.json());
  assert.equal(r.bytes, 11);
});

test('spa-data responds after the configured delay', async () => {
  const t0 = Date.now();
  const r = await fetch(`${srv.base}/api/spa-data?route=reports`).then((r) => r.json());
  assert.ok(Date.now() - t0 >= 15);
  assert.ok(r.reports.some((x) => x.id === 'q3-revenue'));
});

test('index lists every task and every task url serves HTML', async () => {
  const index = await fetch(srv.base + '/').then((r) => r.text());
  for (const t of TASKS) {
    assert.ok(index.includes(`>${t.id}<`), `index lists ${t.id}`);
    const r = await fetch(t.url.replace('{BASE}', srv.base));
    assert.equal(r.status, 200, t.url);
    assert.match(r.headers.get('content-type'), /text\/html/);
  }
});

test('static extras: subpages, SPA fallback, shared module, 404, traversal', async () => {
  for (const p of ['/iframe-same-origin/outer.html', '/iframe-same-origin/inner.html', '/new-tab/portal.html', '/spa-delayed/reports', '/spa-delayed/settings']) {
    assert.equal((await fetch(srv.base + p)).status, 200, p);
  }
  const mod = await fetch(srv.base + '/shared/data.mjs');
  assert.match(mod.headers.get('content-type'), /javascript/);
  assert.equal((await fetch(srv.base + '/nope/')).status, 404);
  assert.equal((await fetch(srv.base + '/spa-delayed/missing.js')).status, 404);
  const trav = await fetch(srv.base + '/%2e%2e/%2e%2e/package.json');
  assert.ok([403, 404].includes(trav.status));
  const redirect = await fetch(srv.base + '/login-form', { redirect: 'manual' });
  assert.equal(redirect.status, 301);
});
