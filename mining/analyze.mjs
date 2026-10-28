// Aggregate mined calls/episodes into a local report (local/<dir>/analysis.md). LOCAL ONLY.
// Usage: node mining/analyze.mjs local/mine-all
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] || 'local/mine-all';
const load = (f) => readFileSync(join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const calls = load('calls.jsonl'), eps = load('episodes.jsonl');
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : '-');
const q = (xs, p) => { const s = xs.filter((x) => x != null && x >= 0).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
const count = (xs) => { const m = new Map(); for (const x of xs) m.set(x, (m.get(x) || 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); };
const fam = (m = '') => m.replace(/^claude-/, '').replace(/-\d{8}$/, '').replace(/-(\d+)-(\d+)$/, ' $1.$2').replace(/-(\d+)$/, ' $1') || 'unknown';
let md = `# Browser-tool usage in real sessions (LOCAL ONLY)\n\n${calls.length} claude-in-chrome calls, ${eps.length} episodes, ${new Set(calls.map((c) => c.session)).size} sessions.\n\n`;

// per model
md += '## Per model\n\n| model | calls | episodes | calls/episode (p50/p90) | error rate | JS share | screenshot share | batch share | p50 latency (s) |\n|---|---|---|---|---|---|---|---|---|\n';
for (const [m] of count(calls.map((c) => fam(c.model)))) {
  const cs = calls.filter((c) => fam(c.model) === m), es = eps.filter((e) => fam(e.model) === m);
  const shots = cs.filter((c) => c.tool === 'computer' && c.input.action === 'screenshot').length + cs.filter((c) => c.tool === 'browser_batch').reduce((a, c) => a + c.input.actions.filter((x) => x === 'computer:screenshot').length, 0);
  md += `| ${m} | ${cs.length} | ${es.length} | ${q(es.map((e) => e.calls.length), 0.5)} / ${q(es.map((e) => e.calls.length), 0.9)} | ${pct(cs.filter((c) => c.error).length, cs.length)} | ${pct(cs.filter((c) => c.tool === 'javascript_tool').length, cs.length)} | ${shots} | ${pct(cs.filter((c) => c.tool === 'browser_batch').length, cs.length)} | ${((q(cs.map((c) => c.ms), 0.5) || 0) / 1000).toFixed(1)} |\n`;
}

// tools
md += '\n## Per tool\n\n| tool | calls | error rate | top error classes | p50 / p95 latency (s) | p50 result chars |\n|---|---|---|---|---|---|\n';
for (const [t, n] of count(calls.map((c) => c.tool))) {
  const cs = calls.filter((c) => c.tool === t);
  const errs = count(cs.filter((c) => c.error).map((c) => c.errClass)).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(', ');
  md += `| ${t} | ${n} | ${pct(cs.filter((c) => c.error).length, n)} | ${errs || '-'} | ${((q(cs.map((c) => c.ms), 0.5) || 0) / 1000).toFixed(1)} / ${((q(cs.map((c) => c.ms), 0.95) || 0) / 1000).toFixed(1)} | ${q(cs.map((c) => c.resultChars), 0.5) ?? '-'} |\n`;
}

// computer actions + batch contents
md += '\n## computer actions (direct + inside browser_batch)\n\n';
const acts = [...calls.filter((c) => c.tool === 'computer').map((c) => `computer:${c.input.action}`), ...calls.filter((c) => c.tool === 'browser_batch').flatMap((c) => c.input.actions)];
md += count(acts).slice(0, 20).map(([k, v]) => `- ${k}: ${v}`).join('\n') + '\n';
const bs = calls.filter((c) => c.tool === 'browser_batch');
md += `\nbrowser_batch: ${bs.length} calls, actions per batch p50 ${q(bs.map((c) => c.input.actions.length), 0.5)}, p90 ${q(bs.map((c) => c.input.actions.length), 0.9)}; contains a wait: ${pct(bs.filter((c) => c.input.actions.includes('computer:wait')).length, bs.length)}\n`;

// JS purposes: what tool gap does JS fill?
const js = calls.filter((c) => c.tool === 'javascript_tool');
md += `\n## Why models call javascript_tool (${js.length} calls; tags can overlap)\n\n`;
md += count(js.flatMap((c) => c.input.purpose)).map(([k, v]) => `- ${k}: ${v} (${pct(v, js.length)})`).join('\n') + '\n';

// errors
md += '\n## Error classes (all tools)\n\n' + count(calls.filter((c) => c.error).map((c) => c.errClass)).map(([k, v]) => `- ${k}: ${v}`).join('\n') + '\n';
md += '\nSample error messages (scrubbed):\n\n' + [...new Set(calls.filter((c) => c.error).map((c) => `[${c.tool}/${c.errClass}] ${String(c.errMsg).replace(/\s+/g, ' ').slice(0, 160)}`))].slice(0, 40).map((s) => `- ${s}`).join('\n') + '\n';

// retries: same tool + same input back to back in a session
let retries = 0;
for (let i = 1; i < calls.length; i++) if (calls[i].session === calls[i - 1].session && calls[i].tool === calls[i - 1].tool && JSON.stringify(calls[i].input) === JSON.stringify(calls[i - 1].input) && calls[i - 1].error) retries++;
md += `\nImmediate retries after an error (same tool + same input): ${retries}\n`;

// wait usage
const waits = acts.filter((a) => a === 'computer:wait').length;
const jsWaits = js.filter((c) => c.input.purpose.includes('wait')).length;
md += `\nExplicit waits: computer:wait ${waits}, JS with sleep/wait ${jsWaits}\n`;

// episode shapes
md += '\n## Episodes\n\n';
md += `- length p50 ${q(eps.map((e) => e.calls.length), 0.5)}, p90 ${q(eps.map((e) => e.calls.length), 0.9)}, max ${Math.max(...eps.map((e) => e.calls.length))}\n`;
md += `- episodes that end with an error: ${pct(eps.filter((e) => /!/.test(e.calls[e.calls.length - 1])).length, eps.length)}\n`;
md += `- duration p50 ${((q(eps.map((e) => (e.end || e.start) - e.start), 0.5) || 0) / 60000).toFixed(1)} min, p90 ${((q(eps.map((e) => (e.end || e.start) - e.start), 0.9) || 0) / 60000).toFixed(1)} min\n`;
md += '- other tools used inside browser episodes: ' + count(eps.flatMap((e) => e.otherTools)).slice(0, 10).map(([k, v]) => `${k} ${v}`).join(', ') + '\n';
md += '\nLongest episodes (scrubbed intent → tool sequence, compressed):\n\n';
const rle = (xs) => { const o = []; for (const x of xs) { const l = o[o.length - 1]; if (l && l[0] === x) l[1]++; else o.push([x, 1]); } return o.map(([x, n]) => (n > 1 ? `${x}×${n}` : x)).join(' → '); };
for (const e of [...eps].sort((a, b) => b.calls.length - a.calls.length).slice(0, 12)) md += `- (${fam(e.model)}, ${e.calls.length} calls) "${String(e.intent || '').replace(/\s+/g, ' ').slice(0, 120)}"\n  ${rle(e.calls).slice(0, 400)}\n`;

writeFileSync(join(dir, 'analysis.md'), md);
console.log(md);
