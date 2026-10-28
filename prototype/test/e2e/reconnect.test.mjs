// The extension link can drop (extension reload, Chrome or service-worker restart, sleep). The relay keeps its
// port and accepts the next pairing; the controller source builds a new controller on it. No /mcp needed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { startServer } from '../../../fixtures/server.mjs';
import { listenRelay } from '../../src/relay.ts';
import { ControllerSource, RECONNECT_NOTICE } from '../../src/session.ts';
import { launchWithExtension } from '../helpers/extension.mjs';

const PORT = 9432;
let srv, chromium, relay, source, swEval;
before(async () => {
  srv = await startServer({ port: 0 });
  const token = randomBytes(16).toString('hex');
  relay = await listenRelay({ port: PORT, token, log: () => {} });
  chromium = await launchWithExtension({ token, port: PORT });
  const { targetInfos } = await chromium.conn.send('Target.getTargets');
  const sw = targetInfos.find((t) => t.type === 'service_worker');
  const { sessionId } = await chromium.conn.send('Target.attachToTarget', { targetId: sw.targetId, flatten: true });
  swEval = async (expr) =>
    (await chromium.conn.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, sessionId)).result?.value;
  source = new ControllerSource(() => relay.browser({ timeoutMs: 30000 }), { front: false });
});
after(async () => {
  await relay?.close();
  await chromium?.close();
  await srv?.close();
});

test('first pairing gives a controller; its only notice asks to name the tab group', async () => {
  const c = await source.get();
  assert.match(await c.navigate(`${srv.base}/login-form/`), /Sign in/);
  assert.match(c.takeNotice(), /^your tab group is Agent:/);
  assert.equal(c.takeNotice(), '');
  assert.equal(await source.get(), c); // same live controller
});

test('after the extension drops its socket, the same relay pairs again and a new controller works', async () => {
  const before = await source.get();
  await swEval('bbmDisconnect()');
  await new Promise((r) => setTimeout(r, 300));
  const c = await source.get();
  assert.notEqual(c, before);
  assert.equal(c.takeNotice(), RECONNECT_NOTICE);
  assert.equal(c.takeNotice(), ''); // told once
  assert.match(await c.navigate(`${srv.base}/long-form/`), /Create account/);
  assert.equal(relay.port, PORT);
});

test('browser() times out with a clear error when no extension comes back', async () => {
  const lone = await listenRelay({ port: 9452, token: 'y'.repeat(32), log: () => {} });
  try {
    await assert.rejects(lone.browser({ timeoutMs: 300 }), /extension is not connected/);
  } finally {
    await lone.close();
  }
});

test('MCP server defaults to extension mode and reconnects after a drop', async () => {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
  const { fileURLToPath } = await import('node:url');
  const port = 9442,
    tok = randomBytes(16).toString('hex');
  const ext = await launchWithExtension({ token: tok, port });
  const { targetInfos } = await ext.conn.send('Target.getTargets');
  const sw = targetInfos.find((t) => t.type === 'service_worker');
  const { sessionId } = await ext.conn.send('Target.attachToTarget', { targetId: sw.targetId, flatten: true });
  const swRun = (e) => ext.conn.send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }, sessionId);
  const client = new Client({ name: 'test', version: '0' });
  const env = { ...process.env, BBM_RELAY_PORT: String(port), BBM_RELAY_TOKEN: tok };
  delete env.BBM_MODE;
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [fileURLToPath(new URL('../../src/server.ts', import.meta.url))],
      env,
    }),
  );
  const call = async (args) => (await client.callTool({ name: 'navigate', arguments: args })).content.map((c) => c.text).join('\n');
  try {
    assert.match(await call({ url: `${srv.base}/login-form/` }), /Sign in/);
    await swRun('bbmDisconnect()');
    await new Promise((r) => setTimeout(r, 300));
    const after = await call({ url: `${srv.base}/long-form/` });
    assert.ok(after.startsWith(RECONNECT_NOTICE), after.slice(0, 200));
    assert.match(after, /Create account/);
    assert.doesNotMatch(await call({ url: `${srv.base}/login-form/` }), /connection dropped/);
  } finally {
    await client.close();
    await ext.close();
  }
});
