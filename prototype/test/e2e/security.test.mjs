// Allowlist is enforced in the browser (frames, page-initiated navigation), not only on tool args.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../../../fixtures/server.mjs';
import { launchChromium } from '../../src/cdp/browser.ts';
import { Controller } from '../../src/controller.ts';

let srv, browser, c;
before(async () => {
  srv = await startServer({ port: 0 });
  browser = await launchChromium({});
  c = new Controller(browser, { allow: [srv.base] });
  await c.init();
});
after(async () => {
  await browser?.close();
  await srv?.close();
});

test('navigate tool refuses other origins', async () => {
  await assert.rejects(c.navigate(`${srv.altBase}/`), /allowlist/);
  await assert.rejects(c.navigate('data:text/html,hi'), /allowlist/);
});

test('cross-origin iframe document is blocked in the browser', async () => {
  const s = await c.navigate(`${srv.base}/iframe-cross-origin/`);
  assert.doesNotMatch(s, /Coupon code/);
});

test('page-initiated navigation to another origin is blocked', async () => {
  await c.navigate(`${srv.base}/login-form/`);
  await c.evaluate({ expression: `location.href = ${JSON.stringify(srv.altBase + '/login-form/')}` });
  await new Promise((r) => setTimeout(r, 500));
  const s = await c.snapshot({});
  assert.match(s, /ERR_BLOCKED_BY_CLIENT/);
  assert.doesNotMatch(s, /Sign in/);
  assert.match((await c.tab()).events.join(' '), /blocked navigation/);
});

test('popup to a disallowed origin is closed', async () => {
  await c.navigate(`${srv.base}/login-form/`);
  const before = (await c.listTabs()).split('\n').length;
  await c.evaluate({ expression: `window.open(${JSON.stringify(srv.altBase + '/login-form/')}, '_blank')` });
  await new Promise((r) => setTimeout(r, 1000));
  const tabs = await c.listTabs();
  assert.doesNotMatch(tabs, new RegExp(String(srv.altPort)));
  assert.ok(tabs.split('\n').length <= before + 1);
});
