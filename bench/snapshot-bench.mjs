// Level-1 benchmark (no LLM): what does each server return when an agent opens each fixture page?
// Measures chars/tokens the model must read, latency, and whether hard-case content is visible.
// Usage: node bench/snapshot-bench.mjs [server...]   (fixture server must run on BASE, default :4777)
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SERVERS } from './servers.mjs';
import { PROBES } from './probes.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:4777';
const OUT = new URL('./results/', import.meta.url);

async function benchServer(name) {
  const s = SERVERS[name];
  const client = new Client({ name: 'bench', version: '0' });
  const t0 = Date.now();
  const cwd = mkdtempSync(join(tmpdir(), 'bench-cwd-')); // playwright-mcp writes .playwright-mcp/ here
  await client.connect(new StdioClientTransport({ command: s.command, args: s.args, env: { ...process.env, ...(s.env || {}) }, stderr: 'ignore', cwd }));
  const { tools } = await client.listTools();
  const defsChars = JSON.stringify(tools).length;
  const call = async (tool, args) => {
    const r = await client.callTool({ name: tool, arguments: args }, undefined, { timeout: 60000 });
    return r.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  };
  // warm up the browser
  await s.open(call, 'about:blank').catch(() => {});
  const rows = [];
  for (const [id, probe] of Object.entries(PROBES)) {
    const ts = Date.now();
    let texts, err;
    try { texts = await s.open(call, `${BASE}/${id}/`); } catch (e) { err = e.message; texts = []; }
    const ms = Date.now() - ts;
    const all = texts.join('\n');
    const lc = all.toLowerCase();
    const missing = probe.must.filter((m) => !lc.includes(m.toLowerCase()));
    const leaked = (probe.mustNot || []).filter((m) => lc.includes(m.toLowerCase()));
    rows.push({ id, chars: all.length, tokens: Math.round(all.length / 4), ms, missing, leaked, err });
    writeFileSync(new URL(`snapshots/${name}--${id}.txt`, OUT), all);
  }
  await client.close();
  return { name, tools: tools.length, defsTokens: Math.round(defsChars / 4), startupMs: Date.now() - t0, rows };
}

mkdirSync(new URL('snapshots/', OUT), { recursive: true });
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SERVERS);
const results = [];
for (const n of names) {
  process.stderr.write(`bench ${n}...\n`);
  results.push(await benchServer(n));
}
writeFileSync(new URL('snapshot-bench.json', OUT), JSON.stringify(results, null, 1));

// markdown table
const ids = Object.keys(PROBES);
let md = `| page | ${results.map((r) => r.name).join(' | ')} |\n|---|${results.map(() => '---').join('|')}|\n`;
for (const id of ids) {
  md += `| ${id} | ${results.map((r) => {
    const x = r.rows.find((y) => y.id === id);
    const flag = x.err ? ' ERR' : (x.missing.length ? ` ✗missing:${x.missing.join(',')}` : '') + (x.leaked.length ? ' ⚠leaked-hidden' : '');
    return `${x.tokens} tok, ${x.ms}ms${flag}`;
  }).join(' | ')} |\n`;
}
const tot = (r) => r.rows.reduce((a, x) => a + x.tokens, 0);
const ok = (r) => r.rows.filter((x) => !x.missing.length && !x.err).length;
md += `| **total tokens** | ${results.map((r) => `**${tot(r)}**`).join(' | ')} |\n`;
md += `| pages fully visible | ${results.map((r) => `${ok(r)}/${ids.length}`).join(' | ')} |\n`;
md += `| tool defs (tokens) | ${results.map((r) => `${r.defsTokens} (${r.tools} tools)`).join(' | ')} |\n`;
writeFileSync(new URL('snapshot-bench.md', OUT), md);
console.log(md);
