// network: timing, size, headers, cookies (values redacted), filters, HAR export.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../../../fixtures/server.mjs';
import { launchChromium } from '../../src/cdp/browser.ts';
import { Controller } from '../../src/controller.ts';

let srv, browser, c;
before(async () => {
  srv = await startServer({ port: 0 });
  browser = await launchChromium({});
  c = new Controller(browser);
  await c.init();
  await c.navigate(`${srv.base}/network/`);
  await c.wait({ text: '20 items', timeout: 5000 });
});
after(async () => {
  await browser?.close();
  await srv?.close();
});

const SECRET = 's3cr3t-session-token-value';
const slowId = async () =>
  (await c.network({ pattern: 'api/slow' }))
    .split('\n')
    .find((l) => /api\/slow/.test(l))
    .split(' ')[0];

test('the list shows duration and size per request', async () => {
  const line = (await c.network({ pattern: 'api/slow' })).split('\n').find((l) => /api\/slow/.test(l));
  const ms = +line.match(/(\d+)ms/)[1];
  assert.ok(ms >= 380, line);
  assert.match(line, /\d+(\.\d+)? ?kB|\d+ ?B/);
});

test('details show timing phases, request and response headers, cookies redacted', async () => {
  const d = await c.network({ id: await slowId() });
  assert.match(d, /timing: .*wait \d+ms/);
  assert.match(d, /x-client: bench/);
  assert.match(d, /x-bench: slow/);
  assert.match(d, /set-cookie: session=s3cr…\(\d+ chars\)/i);
  assert.ok(!d.includes(SECRET), 'cookie value must be redacted');
  assert.match(d, /authorization: Bear…\(\d+ chars\)/i);
  assert.ok(!d.includes('b34rer-secret-token-xyz') && !d.includes('k3y-secret-value-123'), 'credential headers must be redacted');
});

test('cookies view lists the page cookies with flags, values redacted', async () => {
  const out = await c.network({ cookies: true });
  assert.match(out, /session .*HttpOnly/);
  assert.match(out, /theme/);
  assert.ok(!out.includes(SECRET));
});

test('filters: method, status, type', async () => {
  assert.match(await c.network({ method: 'GET', status: '200', type: 'Fetch' }), /api\/slow/);
  assert.doesNotMatch(await c.network({ method: 'POST' }), /api\/slow/);
});

test('HAR export writes a valid file with timings, by name only, into the output folder', async () => {
  process.env.BBM_OUTPUT_DIR = join(tmpdir(), 'bbm-out');
  const r = await c.network({ har: '../../etc/evil' });
  assert.match(r, /saved \d+ requests/);
  const file = r.match(/to (.*)$/)[1];
  assert.equal(file, join(tmpdir(), 'bbm-out', 'evil.har'));
  const har = JSON.parse(readFileSync(file, 'utf8'));
  const e = har.log.entries.find((x) => /api\/slow/.test(x.request.url));
  assert.ok(e && e.time >= 380 && e.timings.wait >= 0, JSON.stringify(e).slice(0, 300));
  const harText = readFileSync(file, 'utf8');
  assert.ok(
    !harText.includes(SECRET) && !harText.includes('b34rer-secret-token-xyz') && !harText.includes('k3y-secret-value-123'),
    'HAR credentials redacted too',
  );
  rmSync(file);
});
