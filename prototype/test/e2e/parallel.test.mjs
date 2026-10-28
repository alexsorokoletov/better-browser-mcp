// L014 step 2: several agent sessions share one Chrome through one extension; each sees only its own tabs.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { startServer } from '../../../fixtures/server.mjs';
import { startRelay, startRelayAuto } from '../../src/relay.ts';
import { Controller } from '../../src/controller.ts';
import { launchWithExtension } from '../helpers/extension.mjs';

const BASE = 9362;
let srv, chromium, a, b, ca, cb;
before(async () => {
  srv = await startServer({ port: 0 });
  const token = randomBytes(16).toString('hex');
  const ra = startRelay({ port: BASE, token, timeoutMs: 30000, log: () => {} });
  chromium = await launchWithExtension({ token, port: BASE });
  a = await ra;
  // second server: BASE is taken, so it moves to the next slot by itself
  b = await startRelayAuto({ basePort: BASE, slots: 4, token, timeoutMs: 30000, log: () => {} });
  ca = new Controller(a, { front: false });
  cb = new Controller(b, { front: false });
  await ca.init();
  await cb.init();
});
after(async () => {
  await a?.close().catch(() => {});
  await b?.close().catch(() => {});
  await chromium?.close();
  await srv?.close();
});

test('the second server takes the next free port', () => {
  assert.equal(b.port, BASE + 1);
});

test('each session sees only its own tabs', async () => {
  await ca.newTab(`${srv.base}/login-form/?session=a`);
  await cb.newTab(`${srv.base}/login-form/?session=b`);
  const la = await ca.listTabs(),
    lb = await cb.listTabs();
  assert.match(la, /session=a/);
  assert.doesNotMatch(la, /session=b/);
  assert.match(lb, /session=b/);
  assert.doesNotMatch(lb, /session=a/);
});

test('both sessions act at the same time', async () => {
  const [ra, rb] = await Promise.all([
    ca.navigate(`${srv.base}/login-form/`).then(() => ca.act([{ click: 'text=Sign in' }], { snapshot: 'none' })),
    cb.navigate(`${srv.base}/long-form/`).then(() => cb.act([{ click: 'text=Create account' }], { snapshot: 'none' })),
  ]);
  assert.ok(ra.ok, ra.text);
  assert.ok(rb.ok, rb.text);
});

test('ending one session leaves the other one working', async () => {
  await cb.newTab(`${srv.base}/login-form/?still=b`);
  await a.close();
  await new Promise((r) => setTimeout(r, 1500));
  assert.match(await cb.listTabs(), /still=b/);
  assert.match(await cb.navigate(`${srv.base}/login-form/`), /Sign in/);
});
