// The server exits when its client goes away (stdin closes, e.g. /mcp reconnect) and frees its relay port,
// under Node and Bun. Before: the handlers were set only after the first browser call, and Bun kept the old
// process alive with its port, so the extension paired with a dead session.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER = fileURLToPath(new URL('../../src/server.ts', import.meta.url));
const BUN = process.env.BUN_BIN || join(homedir(), '.bun', 'bin', 'bun');
const runtimes = [['node', process.execPath], ...(existsSync(BUN) ? [['bun', BUN]] : [])];
const rpc = (id, method, params = {}) => JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';

const portFree = (port) =>
  new Promise((resolve) => {
    const s = createServer()
      .once('error', () => resolve(false))
      .once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
const waitFor = async (fn, ms) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
};

function start(bin, env) {
  const child = spawn(bin, [SERVER], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  const exited = new Promise((resolve) => child.once('exit', (code) => resolve(code)));
  child.stdin.write(rpc(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } }));
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  return { child, exited };
}

for (const [name, bin] of runtimes) {
  test(`${name}: exits when stdin closes before any browser call`, async () => {
    const { child, exited } = start(bin, { BBM_MODE: 'launch' });
    await new Promise((r) => setTimeout(r, 500));
    child.stdin.end();
    assert.equal(await Promise.race([exited, new Promise((r) => setTimeout(() => r('still running'), 5000))]), 0);
  });

  test(`${name}: exits and frees the relay port when stdin closes while waiting for the extension`, async () => {
    const port = name === 'node' ? 9402 : 9403;
    const { child, exited } = start(bin, { BBM_MODE: 'extension', BBM_RELAY_PORT: String(port), BBM_RELAY_TOKEN: 'x'.repeat(32) });
    child.stdin.write(rpc(2, 'tools/call', { name: 'tabs', arguments: { action: 'list' } })); // starts the relay, waits for pairing
    assert.ok(await waitFor(async () => !(await portFree(port)), 5000), 'relay port never opened');
    child.stdin.end();
    const code = await Promise.race([exited, new Promise((r) => setTimeout(() => r('still running'), 5000))]);
    if (code === 'still running') child.kill('SIGKILL');
    assert.equal(code, 0);
    assert.ok(await portFree(port), 'relay port still taken');
  });
}
