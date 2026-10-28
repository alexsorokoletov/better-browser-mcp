// perf report: Web Vitals, long tasks, slowest and largest resources, heap and DOM size.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../../../fixtures/server.mjs';
import { launchChromium } from '../../src/cdp/browser.ts';
import { Controller } from '../../src/controller.ts';

let srv, browser, c, report;
before(async () => {
  srv = await startServer({ port: 0 });
  browser = await launchChromium({});
  c = new Controller(browser);
  await c.init();
  await c.navigate(`${srv.base}/perf/`);
  await new Promise((r) => setTimeout(r, 1500)); // let the long task, the shift and the fetch happen
  report = await c.perf({});
});
after(async () => {
  await browser?.close();
  await srv?.close();
});

test('web vitals with ratings', () => {
  assert.match(report, /LCP \d+ms \((good|needs improvement|poor)\)/);
  assert.match(report, /FCP \d+ms/);
  assert.match(report, /TTFB \d+ms/);
  // the late banner shift is either in CLS or listed as "right after input" (Chrome sometimes flags it so)
  const cls = +report.match(/CLS (\d+\.\d+)/)[1];
  const after = +(report.match(/right after input \(excluded from CLS\): \d+, largest (\d+\.\d+)/)?.[1] || 0);
  assert.ok(Math.max(cls, after) > 0.05, `the late banner shift must show up: ${report}`);
});

test('long tasks are listed with their duration', () => {
  const m = report.match(/long tasks: (\d+), longest (\d+)ms/);
  assert.ok(m && +m[1] >= 1 && +m[2] >= 250, report);
});

test('the slowest resources include the slow request', () => {
  assert.match(report, /slowest:\n\s+(4|5|6)\d\dms .*api\/slow/);
});

test('heap and DOM size from Chrome', () => {
  assert.match(report, /JS heap \d+(\.\d+)? ?MB/);
  assert.match(report, /DOM nodes \d+/);
  assert.ok(+report.match(/layouts (\d+)/)[1] > 0, 'layout count is collected from tab setup on');
  assert.ok(report.length < 2500, `report is ${report.length} chars`);
});
