// One live extension link per relay. A second authenticated link is refused while the first one answers
// (two Chrome profiles must not fight over a session), and replaces it when it does not (half-open after a sleep).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { WebSocket } from 'ws';
import { listenRelay } from '../../src/relay.ts';

const TOKEN = randomBytes(16).toString('hex');
const proof = (role, nonce) => createHmac('sha256', TOKEN).update(`${role}:${nonce}`).digest('hex');
const relays = [];
after(async () => {
  for (const r of relays) await r.close();
});

/** A fake extension: pairs with the real handshake, then answers CDP commands until mute(). */
function fakeExtension(port) {
  let answer = true;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/extension`, { headers: { origin: `chrome-extension://${'a'.repeat(32)}` } });
  const nonce = randomBytes(16).toString('hex');
  const closed = new Promise((r) => ws.on('close', (code) => r(code)));
  const ready = new Promise((resolve) => {
    ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', nonce })));
    ws.on('message', (/** @type {Buffer} */ d) => {
      const m = JSON.parse(d.toString());
      if (m.type === 'hello') ws.send(JSON.stringify({ type: 'auth', proof: proof('ext', m.nonce) }));
      else if (m.type === 'ready') resolve(true);
      else if (m.id !== undefined && answer) ws.send(JSON.stringify({ id: m.id, result: m.method === 'Target.getTargets' ? { targetInfos: [] } : {} }));
    });
    ws.on('error', () => {});
  });
  return {
    ready,
    closed,
    mute: () => {
      answer = false;
    },
  };
}

test('a second link is refused while the first one answers', async () => {
  const relay = await listenRelay({ port: 9460, token: TOKEN, log: () => {} });
  relays.push(relay);
  const a = fakeExtension(9460);
  const first = await relay.browser({ timeoutMs: 5000 });
  const b = fakeExtension(9460);
  assert.equal(await b.closed, 1013);
  assert.equal(relay.pairings(), 1);
  assert.equal(await relay.browser({ timeoutMs: 100 }), first);
  assert.ok(await a.ready);
});

test('a second link replaces a first one that does not answer (half-open after a sleep)', async () => {
  const relay = await listenRelay({ port: 9461, token: TOKEN, log: () => {} });
  relays.push(relay);
  const a = fakeExtension(9461);
  const first = await relay.browser({ timeoutMs: 5000 });
  a.mute();
  const b = fakeExtension(9461);
  assert.ok(await b.ready);
  assert.ok([1000, 1005].includes(await a.closed)); // the relay closed the old link (Node 1005, Bun 1000)
  const second = await relay.browser({ timeoutMs: 5000 });
  assert.notEqual(second, first);
  assert.ok(first.conn.closed);
  assert.equal(relay.pairings(), 2);
});
