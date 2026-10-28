// emulate: Chrome's responsive mode (device metrics), presets, media features, throttling, reset.
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

const page = async () =>
  JSON.parse(
    await c.evaluate({
      diff: false,
      expression:
        'JSON.stringify({w: innerWidth, h: innerHeight, dpr: devicePixelRatio, touch: navigator.maxTouchPoints > 0, dark: matchMedia("(prefers-color-scheme: dark)").matches, ua: navigator.userAgent})',
    }),
  );

test('a width and height set the viewport the page sees', async () => {
  await c.navigate(`${srv.base}/login-form/`);
  const r = await c.emulate({ width: 600, height: 700 });
  assert.match(r, /600×700/);
  const p = await page();
  assert.equal(p.w, 600);
  assert.equal(p.h, 700);
});

test('a phone preset sets size, pixel ratio, touch and a mobile user agent', async () => {
  await c.navigate(`${srv.base}/login-form/`);
  await c.emulate({ device: 'iphone-15' });
  const p = await page();
  assert.equal(p.w, 393);
  assert.equal(p.dpr, 3);
  assert.equal(p.touch, true);
  assert.match(p.ua, /iPhone/);
});

test('media features: dark mode', async () => {
  await c.navigate(`${srv.base}/login-form/`);
  await c.emulate({ colorScheme: 'dark' });
  assert.equal((await page()).dark, true);
});

test('network throttling slows a page load; reset restores everything', async () => {
  await c.emulate({ reset: true });
  await c.navigate(`${srv.base}/login-form/`);
  const base = await page(); // the machine's own settings (it may be in dark mode)
  let t = Date.now();
  await c.navigate(`${srv.base}/long-form/`);
  const fast = Date.now() - t;
  await c.emulate({ network: 'slow-3g' });
  t = Date.now();
  await c.navigate(`${srv.base}/long-form/?x=1`);
  const slow = Date.now() - t;
  assert.ok(slow > fast + 400, `slow ${slow}ms vs fast ${fast}ms`);
  const r = await c.emulate({ reset: true });
  assert.match(r, /reset/);
  const p = await page();
  assert.equal(p.w, base.w);
  assert.equal(p.dark, base.dark);
});
