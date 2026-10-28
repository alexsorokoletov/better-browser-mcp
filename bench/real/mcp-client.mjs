// Minimal stdio MCP client for better-browser-mcp in extension mode (used by the checkers).
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'prototype', 'src', 'server.ts');

export async function connect({ stderr = 'ignore' } = {}) {
  const p = spawn('bun', [SERVER], { env: { ...process.env, BBM_MODE: 'extension', BBM_GUARD: 'shop-social' }, stdio: ['pipe', 'pipe', stderr] });
  let buf = '', id = 0;
  const waiting = new Map();
  p.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      try { const m = JSON.parse(line); waiting.get(m.id)?.(m); } catch {}
    }
  });
  const rpc = (method, params) => new Promise((resolve) => { const n = ++id; waiting.set(n, resolve); p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: n, method, params }) + '\n'); });
  await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'bench', version: '1' } });
  p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  return {
    /** Raw tool result: {content, isError}. */
    call: async (name, args) => (await rpc('tools/call', { name, arguments: args })).result || {},
    /** Text of a tool result. */
    text: async (name, args) => ((await rpc('tools/call', { name, arguments: args })).result?.content || []).map((c) => c.text || '').join('\n'),
    close: () => { p.stdin.end(); setTimeout(() => process.exit(0), 300); },
  };
}
