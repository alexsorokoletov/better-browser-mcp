// Aggregate agent-bench results into a markdown report.
// Usage: node bench/report.mjs bench/results/agent/<tag> [more tags...] > report.md
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const rows = [];
for (const dir of process.argv.slice(2)) {
  const f = join(dir, 'results.jsonl');
  if (!existsSync(f)) continue;
  for (const l of readFileSync(f, 'utf8').split('\n').filter(Boolean)) {
    const r = JSON.parse(l);
    if (/usage limit/i.test(r.error || '')) continue; // harness quota, not a browser-tool result
    rows.push(r);
  }
}
const groups = new Map();
for (const r of rows) {
  const k = `${r.harness}|${r.server}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const fmt = (n, d = 0) => (Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }) : '-');

let md = '';
for (const harness of [...new Set(rows.map((r) => r.harness))]) {
  const keys = [...groups.keys()].filter((k) => k.startsWith(harness + '|'));
  const model = rows.find((r) => r.harness === harness)?.model;
  md += `### ${harness} (${model})\n\n| server | success | input tok / task | uncached input / task | output tok / task | tool calls / task | time / task (s) | cost / task ($) |\n|---|---|---|---|---|---|---|---|\n`;
  const stats = keys.map((k) => {
    const g = groups.get(k);
    return {
      server: k.split('|')[1], n: g.length, pass: g.filter((r) => r.pass).length,
      inTok: mean(g.map((r) => r.totalInput)), uncached: mean(g.map((r) => r.totalInput - (r.cacheRead || 0))), outTok: mean(g.map((r) => r.outputTokens)), calls: mean(g.map((r) => r.toolCalls)),
      secs: mean(g.map((r) => r.ms / 1000)), med: median(g.map((r) => r.ms / 1000)),
      cost: mean(g.map((r) => r.costUsd).filter((x) => x != null)),
    };
  }).sort((a, b) => b.pass / b.n - a.pass / a.n || a.inTok - b.inTok);
  for (const s of stats) {
    md += `| ${s.server} | ${s.pass}/${s.n} (${fmt((100 * s.pass) / s.n)}%) | ${fmt(s.inTok)} | ${fmt(s.uncached)} | ${fmt(s.outTok)} | ${fmt(s.calls, 1)} | ${fmt(s.secs, 1)} (median ${fmt(s.med, 1)}) | ${fmt(s.cost, 3)} |\n`;
  }
  // per-task matrix
  const tasks = [...new Set(rows.filter((r) => r.harness === harness).map((r) => r.task))];
  md += `\nPer task (passes/runs, mean tool calls, mean input k-tokens):\n\n| task | ${stats.map((s) => s.server).join(' | ')} |\n|---|${stats.map(() => '---').join('|')}|\n`;
  for (const t of tasks) {
    md += `| ${t} | ${stats.map((s) => {
      const g = groups.get(`${harness}|${s.server}`).filter((r) => r.task === t);
      if (!g.length) return '-';
      const p = g.filter((r) => r.pass).length;
      return `${p === g.length ? '✅' : p ? '🟡' : '❌'} ${p}/${g.length} · ${fmt(mean(g.map((r) => r.toolCalls)), 1)} calls · ${fmt(mean(g.map((r) => r.totalInput)) / 1000, 0)}k`;
    }).join(' | ')} |\n`;
  }
  const fails = rows.filter((r) => r.harness === harness && !r.pass);
  if (fails.length) {
    md += `\nFailures:\n\n`;
    for (const f of fails) md += `- ${f.server} / ${f.task} #${f.run}: ${String(JSON.stringify(f.details)).slice(0, 200)}${f.timedOut ? ' (timeout)' : ''}${f.error ? ' ERR ' + f.error.slice(0, 100) : ''}\n`;
  }
  md += '\n';
}
console.log(md);
