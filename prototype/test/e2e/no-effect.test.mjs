// L012: a click that changes nothing must not report plain success.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../../../fixtures/server.mjs';
import { launchChromium } from '../../src/cdp/browser.ts';
import { Controller } from '../../src/controller.ts';

let srv, browser, c;
before(async () => {
  srv = await startServer({ port: 0 });
  browser = await launchChromium({});
  c = new Controller(browser);
  await c.init();
});
after(async () => {
  await browser?.close();
  await srv?.close();
});

test('a button that ignores the mouse is activated from the keyboard, and says so', async () => {
  await c.navigate(`${srv.base}/no-effect/`);
  const r = await c.act([{ click: 'text=Delete' }]);
  assert.match(r.text, /activated with Enter/);
  assert.equal(await c.evaluate({ expression: '!!document.getElementById("hub")', diff: false }), 'false');
});

test('a dead button reports no effect instead of plain success', async () => {
  await c.navigate(`${srv.base}/no-effect/`);
  const r = await c.act([{ click: 'text=Does nothing' }], { snapshot: 'none' });
  assert.match(r.text, /⚠ no effect/);
  assert.doesNotMatch(r.text, /Does nothing ✓/);
});

test('a working button is a plain ✓', async () => {
  await c.navigate(`${srv.base}/no-effect/`);
  const r = await c.act([{ click: 'text=Save' }], { snapshot: 'none' });
  assert.match(r.text, /Save ✓/);
  assert.doesNotMatch(r.text, /no effect|keyboard/);
});
