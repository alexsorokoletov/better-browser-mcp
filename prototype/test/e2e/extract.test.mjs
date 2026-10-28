// extract (tables, key-value blocks, lists as JSON) and read format=markdown (main content only).
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

test('extract turns a header table into rows keyed by column', async () => {
  await c.navigate(`${srv.base}/property-record/`);
  const out = JSON.parse(await c.extract({}));
  const taxes = out.blocks.find((b) => b.kind === 'table' && b.columns.includes('Balance Due'));
  assert.ok(taxes, JSON.stringify(out).slice(0, 400));
  assert.equal(taxes.rows.length, 3);
  assert.equal(taxes.rows[1]['Balance Due'], '$11,856.19');
  assert.equal(taxes.rows[2]['Net Taxes'], '$23,023.73');
});

test('extract skips one-cell "tables" used as headings and header rows that are not records', async () => {
  await c.navigate(`${srv.base}/property-record/`);
  const out = JSON.parse(await c.extract({}));
  assert.ok(!out.blocks.some((b) => b.kind === 'table' && b.columns.length === 1), JSON.stringify(out.blocks.map((b) => b.columns || Object.keys(b.fields))));
  assert.ok(!out.blocks.some((b) => b.kind === 'fields' && 'Name withheld by request.' in b.fields));
  const md = await c.text({ format: 'markdown' });
  assert.doesNotMatch(md, /\| Stub Number \|/);
  assert.match(md, /^Stub Number$/m);
});

test('extract turns label|value tables and dl lists into fields', async () => {
  await c.navigate(`${srv.base}/property-record/`);
  const out = JSON.parse(await c.extract({}));
  const fields = Object.assign({}, ...out.blocks.filter((b) => b.kind === 'fields').map((b) => b.fields));
  assert.equal(fields['Tax District'], '20103');
  assert.equal(fields['Land Area (SQFT)'], '10,652');
  assert.equal(fields['Pending Refunds'], '$.00');
});

test('extract on a large data table returns all rendered rows with headers', async () => {
  await c.navigate(`${srv.base}/data-extraction/`);
  const out = JSON.parse(await c.extract({}));
  const t = out.blocks.find((b) => b.kind === 'table');
  assert.deepEqual(t.columns.slice(0, 3), ['Order', 'Date', 'Customer']);
  assert.equal(t.rows.length, 25);
});

test('read format=markdown keeps the main content as markdown and drops nav and footer', async () => {
  await c.navigate(`${srv.base}/property-record/`);
  const md = await c.text({ format: 'markdown' });
  assert.match(md, /^# MAP #: 1234 56 7890/m);
  assert.match(md, /\| Year \| Installment \| Net Taxes \|/);
  assert.match(md, /\| --- \|/);
  assert.match(md, /\*\*Tax District\*\*: 20103/);
  assert.doesNotMatch(md, /Residents|FOIA Requests|Government Center/);
  assert.ok(md.length < 1200, `markdown is ${md.length} chars`);
});
