// L015: other extensions inject their own chrome-extension:// iframes (password managers on focus).
// The debugger must skip those frames and keep working; a detach is recovered on the next call.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { startServer } from '../../../fixtures/server.mjs';
import { startRelay } from '../../src/relay.ts';
import { Controller } from '../../src/controller.ts';
import { launchWithExtension, FAKE_PM_DIR } from '../helpers/extension.mjs';

let srv, chromium, browser, c;
before(async () => {
  srv = await startServer({ port: 0 });
  const token = randomBytes(16).toString('hex'),
    port = 9372;
  const relay = startRelay({ port, token, timeoutMs: 30000, log: () => {} });
  chromium = await launchWithExtension({ token, port, extra: [FAKE_PM_DIR] });
  browser = await relay;
  c = new Controller(browser, { front: false });
  await c.init();
});
after(async () => {
  await browser?.close().catch(() => {});
  await chromium?.close();
  await srv?.close();
});

test('agent tabs opt fields out of password managers, so no menu iframe appears', async () => {
  const snap = await c.navigate(`${srv.base}/login-form/`);
  const user = snap.match(/textbox "Username[^"]*" \[(e\d+)\]/)?.[1];
  const r = await c.act([{ type: user, text: 'demo' }], { snapshot: 'none' });
  assert.ok(r.ok, r.text);
  assert.doesNotMatch(r.text, /re-attached/);
  assert.equal(await c.evaluate({ expression: '!!document.getElementById("fake-pm-menu")', diff: false }), 'false');
});

test('a manager that ignores the opt-out: the session recovers and the step still succeeds', async () => {
  const snap = await c.navigate(`${srv.base}/login-form/?stubborn`);
  const user = snap.match(/textbox "Username[^"]*" \[(e\d+)\]/)?.[1];
  assert.ok(user, snap);
  const r = await c.act([{ type: user, text: 'demo' }], { snapshot: 'none' });
  assert.ok(r.ok, r.text);
  await new Promise((res) => setTimeout(res, 500)); // the menu iframe is in the page now
  assert.match(await c.snapshot({}), /Sign in/);
  const r2 = await c.act([{ click: 'text=Sign in' }], { snapshot: 'none' });
  assert.ok(r2.ok, r2.text);
});

test('after the debugger is detached from outside, the next call re-attaches', async () => {
  await c.navigate(`${srv.base}/login-form/`);
  const { targetInfos } = await chromium.conn.send('Target.getTargets');
  const sw = targetInfos.find((t) => t.type === 'service_worker' && t.url.startsWith(`chrome-extension://${chromium.extensionId}/`));
  const { sessionId } = await chromium.conn.send('Target.attachToTarget', { targetId: sw.targetId, flatten: true });
  const tabId = +(await c.tab()).targetId;
  await chromium.conn.send('Runtime.evaluate', { expression: `chrome.debugger.detach({tabId:${tabId}})`, awaitPromise: true }, sessionId);
  await new Promise((res) => setTimeout(res, 300));
  assert.match(await c.navigate(`${srv.base}/long-form/`), /Create account/);
});
