// Compare server runtimes (Node vs Bun) over MCP stdio. Usage:
//   node scripts/bench-runtime.mjs [runs=10] [runtimes=node,bun]
// Per run: cold start (spawn -> initialize response), first navigate (includes browser launch),
// then 10 warm navigate + 10 warm act calls against the fixtures server. Prints median and p90 in ms.
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { startServer } from '../../fixtures/server.mjs';

const runs = Number(process.argv[2] || 10);
const runtimes = (process.argv[3] || 'node,bun').split(',');
const SERVER = fileURLToPath(new URL('../src/server.ts', import.meta.url));
const WARM = 10;

const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)];
};
const fmt = (xs) => `${pct(xs, 0.5).toFixed(0)} / ${pct(xs, 0.9).toFixed(0)}`;

const srv = await startServer({ port: 0 });
const url = `${srv.base}/login-form/`;
/** @type {[string, Record<string, number[]>][]} */
const rows = [];
try {
  for (const rt of runtimes) {
    const m = { start: [], first: [], navigate: [], act: [] };
    for (let i = 0; i < runs; i++) {
      const client = new Client({ name: 'bench', version: '0' });
      let t = performance.now();
      await client.connect(new StdioClientTransport({ command: rt, args: [SERVER], env: { ...process.env, BBM_MODE: 'launch', BBM_HEADLESS: '1' } }));
      m.start.push(performance.now() - t);
      const call = async (name, args) => {
        const t0 = performance.now();
        const r = await client.callTool({ name, arguments: args });
        if (r.isError) throw new Error(`${name}: ${r.content[0]?.text}`);
        return [performance.now() - t0, r.content.map((c) => c.text).join('\n')];
      };
      const [first, snap] = await call('navigate', { url });
      m.first.push(first);
      const ref = /textbox "Username" \[(e\d+)\]/.exec(snap)[1];
      for (let j = 0; j < WARM; j++) {
        m.navigate.push((await call('navigate', { url }))[0]);
        m.act.push((await call('act', { steps: [{ type: ref, text: `user${j}` }] }))[0]);
      }
      await client.close();
    }
    rows.push([rt, m]);
  }
} finally {
  await srv.close();
}

console.log(`runs=${runs}, warm calls per run=${WARM}, median / p90 ms`);
console.log('| runtime | cold start | first navigate | navigate | act |');
console.log('|---|---|---|---|---|');
for (const [rt, m] of rows) console.log(`| ${rt} | ${fmt(m.start)} | ${fmt(m.first)} | ${fmt(m.navigate)} | ${fmt(m.act)} |`);
