// Extension relay pairing: mutual HMAC proof; wrong token or forged clients never get a session.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { WebSocket } from 'ws';
import { startRelay } from '../../src/relay.ts';
import { launchWithExtension } from '../helpers/extension.mjs';

const PORT = 9341;
const tok = () => randomBytes(16).toString('hex');

test('correct token pairs; only agent tabs are visible', async () => {
  const token = tok();
  const relay = startRelay({ port: PORT, token, timeoutMs: 45000, log: () => {} });
  const chromium = await launchWithExtension({ token, port: PORT });
  try {
    const b = await relay;
    assert.equal(b.listTabs().length, 0, 'user tabs (the launch about:blank) are hidden');
    const id = await b.createTab('about:blank');
    assert.equal(b.listTabs().length, 1);
    await b.closeTab(id);
    await b.close();
  } finally {
    await chromium.close();
  }
});

test('wrong token: extension refuses the server (no session)', async () => {
  const relay = startRelay({ port: PORT + 1, token: tok(), timeoutMs: 25000, log: () => {} });
  const chromium = await launchWithExtension({ token: tok(), port: PORT + 1 });
  try {
    await assert.rejects(relay, /did not connect\/pair/);
  } finally {
    await chromium.close();
  }
});

test('forged client with extension origin but no proof is rejected', async () => {
  const relay = startRelay({ port: PORT + 2, token: tok(), timeoutMs: 4000, log: () => {} });
  // Origin as a header: Bun's ws client ignores the `origin` option.
  const ws = new WebSocket(`ws://127.0.0.1:${PORT + 2}/extension`, { headers: { origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop' } });
  const closed = new Promise((r) => ws.on('close', (code) => r(code)));
  ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', nonce: 'x'.repeat(32) })));
  ws.on('message', () => ws.send(JSON.stringify({ type: 'auth', proof: 'deadbeef' })));
  assert.equal(await closed, 1008);
  await assert.rejects(relay);
});
