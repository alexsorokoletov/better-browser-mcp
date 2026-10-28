// L013: inside an open modal, snapshots and act diffs cover the modal only; screenshots respect devicePixelRatio.
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

test('opening a modal scopes the act result to it', async () => {
  await c.navigate(`${srv.base}/modal-composer/`);
  const r = await c.act([{ click: 'text=New thread' }]);
  assert.match(r.text, /modal open: "New thread"/);
  assert.doesNotMatch(r.text, /Feed item/);
  assert.match(r.text, /Post 1 text/);
});

test('edits inside the modal return a small diff with the new ref, no feed noise', async () => {
  await c.navigate(`${srv.base}/modal-composer/`);
  const r0 = await c.act([{ click: 'text=New thread' }]);
  const ref = r0.text.match(/textbox "Post 1 text" \[(e\d+)\]/)[1];
  const r = await c.act([{ type: ref, text: 'hello' }, { click: 'text=Add to thread' }]);
  assert.doesNotMatch(r.text, /Feed item/);
  assert.match(r.text, /textbox "Post 2 text" \[e\d+\]/);
  assert.ok(r.text.length < 1200, `act result is ${r.text.length} chars`);
});

test('snapshot scope=page still shows the whole page; default shows the modal', async () => {
  await c.navigate(`${srv.base}/modal-composer/`);
  await c.act([{ click: 'text=New thread' }]);
  assert.doesNotMatch(await c.snapshot({}), /Feed item/);
  assert.match(await c.snapshot({ scope: 'page' }), /Feed item/);
});

test('screenshots are capped in real pixels on a 2x display', async () => {
  await c.navigate(`${srv.base}/modal-composer/`);
  const tab = await c.tab();
  await tab.root.send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 2, mobile: false });
  const shot = await tab.screenshot({});
  await tab.root.send('Emulation.clearDeviceMetricsOverride');
  const buf = Buffer.from(shot.data, 'base64');
  // JPEG SOF0/SOF2 width
  let i = 2,
    w = 0;
  while (i < buf.length) {
    const m = buf[i + 1],
      len = buf.readUInt16BE(i + 2);
    if (m === 0xc0 || m === 0xc2) {
      w = buf.readUInt16BE(i + 7);
      break;
    }
    i += 2 + len;
  }
  assert.ok(w > 0 && w <= 1280, `screenshot is ${w}px wide`);
});
