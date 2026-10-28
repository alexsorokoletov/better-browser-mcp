// Level-1 probe for claude-in-chrome (it is built into Claude Code, not a stdio server).
// A scripted `claude -p --chrome` agent calls navigate + read_page on each fixture page; we measure the
// tool results it received (stream-json), with the same probes as snapshot-bench.
// Usage: node bench/cic-probe.mjs   -> bench/results/cic-probe.json + appends a column to snapshot-bench.md
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../fixtures/server.mjs';
import { PROBES } from './probes.mjs';

const srv = await startServer({ port: 0 });
const ids = Object.keys(PROBES);
const cwd = mkdtempSync(join(tmpdir(), 'cic-probe-'));
writeFileSync(join(cwd, 'mcp.json'), '{"mcpServers":{}}');
const prompt = `You are a measurement script. For each URL below, in order: call the claude-in-chrome navigate tool with the URL, then call read_page once with default arguments. Make separate tool calls (do NOT use browser_batch). Do not click, type or call any other tool except tabs_context_mcp/tabs_create_mcp if you need a tab. After the last URL reply DONE.\n` +
  ids.map((id, i) => `${i + 1}. ${srv.base}/${id}/`).join('\n');

const out = await new Promise((resolve) => {
  const p = spawn('claude', ['-p', prompt, '--chrome', '--model', 'sonnet', '--output-format', 'stream-json', '--verbose', '--tools', '',
    '--strict-mcp-config', '--mcp-config', join(cwd, 'mcp.json'), '--setting-sources', 'project', '--no-session-persistence',
    // no permission bypass: only the read-only tools the probe needs (it drives the user's real Chrome)
    '--allowedTools', ['navigate', 'read_page', 'tabs_context_mcp', 'tabs_create_mcp'].map((t) => `mcp__claude-in-chrome__${t}`).join(',')], { cwd, stdio: ['ignore', 'pipe', 'inherit'] });
  let s = ''; p.stdout.on('data', (d) => { s += d; }); p.on('close', () => resolve(s));
});
await srv.close();
writeFileSync(new URL('./results/cic-probe.raw.jsonl', import.meta.url), out);

// pair tool_use -> tool_result, with timestamps between them
const uses = new Map();
const calls = [];
for (const l of out.split('\n').filter(Boolean)) {
  let d; try { d = JSON.parse(l); } catch { continue; }
  if (d.type === 'assistant') for (const c of d.message.content) if (c.type === 'tool_use') uses.set(c.id, { name: c.name.split('__').pop(), input: c.input });
  if (d.type === 'user') for (const c of d.message.content || []) if (c.type === 'tool_result' && uses.has(c.tool_use_id)) {
    const u = uses.get(c.tool_use_id);
    const parts = Array.isArray(c.content) ? c.content : [{ type: 'text', text: String(c.content) }];
    calls.push({ ...u, text: parts.filter((x) => x.type === 'text').map((x) => x.text).join('\n') });
  }
}
const rows = [];
for (const id of ids) {
  const url = `${srv.base}/${id}/`;
  const ni = calls.findIndex((c) => c.name === 'navigate' && String(c.input.url).startsWith(url));
  if (ni < 0) { rows.push({ id, err: 'not visited' }); continue; }
  const rp = calls.slice(ni + 1).find((c) => c.name === 'read_page');
  const all = calls[ni].text + '\n' + (rp?.text || '');
  const lc = all.toLowerCase();
  rows.push({
    id, chars: all.length, tokens: Math.round(all.length / 4), navChars: calls[ni].text.length, readChars: rp?.text.length,
    missing: PROBES[id].must.filter((m) => !lc.includes(m.toLowerCase())),
    leaked: (PROBES[id].mustNot || []).filter((m) => lc.includes(m.toLowerCase())),
  });
}
writeFileSync(new URL('./results/cic-probe.json', import.meta.url), JSON.stringify({ rows, calls: calls.map((c) => ({ name: c.name, input: c.input, chars: c.text.length })) }, null, 1));
for (const r of rows) console.log(`${r.id.padEnd(22)} ${r.err || `${r.tokens} tok${r.missing.length ? ' ✗missing:' + r.missing.join(',') : ''}${r.leaked.length ? ' ⚠leaked-hidden' : ''}`}`);
console.log('total tokens', rows.reduce((a, r) => a + (r.tokens || 0), 0), 'fully visible', rows.filter((r) => !r.err && !r.missing.length).length + '/' + ids.length);
