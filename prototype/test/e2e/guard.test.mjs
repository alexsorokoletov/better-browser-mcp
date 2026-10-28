// BBM_GUARD=shop-social: purchase and post controls are refused before any input reaches the page.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../../../fixtures/server.mjs';
import { launchChromium } from '../../src/cdp/browser.ts';
import { Controller, makeDeny } from '../../src/controller.ts';

let srv, browser, c;
before(async () => {
  srv = await startServer({ port: 0 });
  browser = await launchChromium({});
  c = new Controller(browser, { deny: makeDeny('shop-social') });
  await c.init();
});
after(async () => {
  await browser?.close();
  await srv?.close();
});

const state = async () => await c.evaluate({ expression: 'document.getElementById("state").textContent' });

test('makeDeny: off by default, preset matches names and urls', () => {
  assert.equal(makeDeny(undefined), null);
  const d = makeDeny('shop-social');
  for (const n of ['Buy now', 'Place your order', 'Proceed to checkout', 'Post', ' post all ']) assert.ok(d.name(n), n);
  for (const n of ['Add to cart', 'Posts', 'Post a reply guide', 'Checkout guide']) assert.ok(!d.name(n), n);
  assert.ok(d.url('https://www.amazon.com/gp/buy/spc/handlers/display.html'));
  assert.ok(d.url('https://www.amazon.de/checkout/p/x'));
  assert.ok(!d.url('https://www.amazon.com/gp/cart/view.html'));
  // normalized before matching: double slashes and percent-encoding do not slip through
  assert.ok(d.url('https://www.amazon.com/gp//buy/x'));
  assert.ok(d.url('https://www.amazon.com/%63heckout/p'));
  assert.ok(d.url('https://shop.example.com/checkout.html'));
  assert.ok(d.url('https://www.amazon.com/gp/buy-now/x'));
  assert.ok(!d.url('https://www.amazon.com/checkouts-guide-faq'.replace('checkouts', 'check-outs')));
});

test('Enter on a focused "Buy now" is blocked', async () => {
  await c.navigate(`${srv.base}/guard/`);
  const snap = await c.snapshot({});
  const ref = snap.match(/button "Buy now" \[(e\d+)\]/)[1];
  const r = await c.act([{ press: 'Enter', ref }], { snapshot: 'none' });
  assert.match(r.text, /blocked_by_policy/);
  assert.match(await state(), /idle/);
});

test('an obfuscated JS click is stopped inside the page', async () => {
  await c.navigate(`${srv.base}/guard/`);
  await c.evaluate({ expression: 'document.getElementById("buy")["cli" + "ck"]()' }).catch(() => {});
  assert.match(await state(), /idle/);
});

test('submitting a form that goes to checkout is blocked (type + submit, and Enter)', async () => {
  await c.navigate(`${srv.base}/guard/`);
  const snap = await c.snapshot({});
  const qty = snap.match(/textbox "Quantity" \[(e\d+)\]/)[1];
  const r = await c.act([{ type: qty, text: '2', submit: true }], { snapshot: 'none' });
  assert.match(r.text, /blocked_by_policy/);
  assert.match(await state(), /idle/);
});

test('a navigation the page starts itself to checkout is blocked in the browser', async () => {
  await c.navigate(`${srv.base}/guard/`);
  await c.evaluate({ expression: 'location.href = "/checkout/"' }).catch(() => {});
  await new Promise((r) => setTimeout(r, 600));
  assert.doesNotMatch((await c.tab()).lastSnapshot?.url || '', /checkout/);
  assert.match((await c.tab()).events.join(' '), /blocked_by_policy/);
});

test('click on "Buy now" is blocked and does nothing', async () => {
  await c.navigate(`${srv.base}/guard/`);
  const r = await c.act([{ click: 'text=Buy now' }], { snapshot: 'none' });
  assert.equal(r.ok, false);
  assert.match(r.text, /blocked_by_policy/);
  assert.match(await state(), /idle/);
});

test('click on a div role=button "Post" is blocked, by ref and by coordinates', async () => {
  await c.navigate(`${srv.base}/guard/`);
  const r1 = await c.act([{ click: 'text=Post' }], { snapshot: 'none' });
  assert.match(r1.text, /blocked_by_policy/);
  const box = JSON.parse(
    await c.evaluate({ expression: 'JSON.stringify((r => [r.x + r.width / 2, r.y + r.height / 2])(document.getElementById("post").getBoundingClientRect()))' }),
  );
  const r2 = await c.act([{ click_xy: box }], { snapshot: 'none' });
  assert.match(r2.text, /blocked_by_policy/);
  assert.match(await state(), /idle/);
});

test('JS clicks through eval are blocked', async () => {
  await c.navigate(`${srv.base}/guard/`);
  await assert.rejects(c.evaluate({ expression: 'document.getElementById("buy").click()' }), /blocked_by_policy/);
  assert.match(await state(), /idle/);
});

test('checkout navigation is blocked; allowed controls still work', async () => {
  await assert.rejects(c.navigate(`${srv.base}/checkout/`), /blocked_by_policy/);
  await c.navigate(`${srv.base}/guard/`);
  const r = await c.act([{ click: 'text=Add to cart' }], { snapshot: 'none' });
  assert.equal(r.ok, true);
  assert.match(await state(), /added to cart/);
});
