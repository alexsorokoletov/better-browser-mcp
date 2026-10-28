// One-off real-site comparison: same prompt, same model, ours (extension mode) vs claude-in-chrome, run one after another.
// node bench/real/oneoff.mjs <tag> <prompt-file>
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const [tag, promptFile] = process.argv.slice(2);
const prompt = readFileSync(promptFile, 'utf8');
const OUT = join(HERE, 'results', tag);
mkdirSync(OUT, { recursive: true });

const SERVERS = {
  bbm: { command: 'bun', args: [join(ROOT, 'prototype/src/server.ts')], env: { BBM_MODE: 'extension', BBM_GUARD: 'shop-social', BBM_KEEP_TABS: '1', ...(process.env.BBM_UPLOAD_ROOTS ? { BBM_UPLOAD_ROOTS: process.env.BBM_UPLOAD_ROOTS } : {}) } },
  'claude-in-chrome': null,
};

function run(server) {
  const cfg = join(OUT, `${server}.mcp.json`);
  writeFileSync(cfg, JSON.stringify({ mcpServers: SERVERS[server] ? { [server]: SERVERS[server] } : {} }));
  const argv = ['-p', prompt, '--model', 'sonnet', '--output-format', 'stream-json', '--verbose', '--tools', '',
    '--strict-mcp-config', '--mcp-config', cfg, '--setting-sources', 'project', '--no-session-persistence',
    '--allowedTools', `mcp__${server}__*`, '--max-budget-usd', '3', server === 'claude-in-chrome' ? '--chrome' : '--no-chrome'];
  return new Promise((resolve) => {
    const t0 = Date.now();
    const p = spawn('claude', argv, { cwd: OUT, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    // Safety watchdog: kill the run if a click/type/key call names a purchase or publish control.
    const WATCH = /"(post|post all|buy now|place (your )?order|proceed to checkout)"|\/checkout|\/gp\/buy/i;
    let seen = 0;
    p.stdout.on('data', (d) => {
      out += d;
      const lines = out.split('\n');
      for (; seen < lines.length - 1; seen++) {
        let m; try { m = JSON.parse(lines[seen]); } catch { continue; }
        if (m.type !== 'assistant') continue;
        for (const c of m.message?.content || []) {
          if (c.type !== 'tool_use') continue;
          const inp = JSON.stringify(c.input || {});
          if (WATCH.test(inp) && !/navigate.*amazon\.com\/?"|get_page_text|read_page|screenshot/.test(c.name + inp)) {
            writeFileSync(join(OUT, `${server}.SAFETY-STOP.txt`), `${c.name} ${inp}\n`);
            p.kill('SIGKILL');
          }
        }
      }
    });
    p.stderr.on('data', (d) => { err += d; });
    const kill = setTimeout(() => p.kill('SIGTERM'), 8 * 60 * 1000);
    p.on('close', (code) => {
      clearTimeout(kill);
      writeFileSync(join(OUT, `${server}.jsonl`), out);
      if (err) writeFileSync(join(OUT, `${server}.stderr.txt`), err);
      resolve(summarize(server, out, Date.now() - t0, code));
    });
  });
}

function summarize(server, out, ms, code) {
  const m = { server, ms, code, calls: 0, tools: {}, errors: 0, inputTokens: 0, outputTokens: 0, costUsd: null, result: '' };
  for (const l of out.split('\n')) {
    let d; try { d = JSON.parse(l); } catch { continue; }
    if (d.type === 'assistant') for (const c of d.message?.content || []) if (c.type === 'tool_use') { m.calls++; const n = c.name.replace(/^mcp__[^_]+(?:-[^_]+)*__/, ''); m.tools[n] = (m.tools[n] || 0) + 1; }
    if (d.type === 'user') for (const c of d.message?.content || []) if (c.type === 'tool_result' && c.is_error) m.errors++;
    if (d.type === 'result') {
      const u = d.usage || {};
      m.inputTokens = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
      m.outputTokens = u.output_tokens || 0; m.costUsd = d.total_cost_usd; m.result = String(d.result || ''); m.isError = d.is_error;
    }
  }
  return m;
}

const rows = [];
for (const s of (process.env.SERVERS || 'bbm,claude-in-chrome').split(',')) {
  const r = await run(s);
  rows.push(r);
  console.log(`${s.padEnd(18)} ${(r.ms / 1000).toFixed(1)}s calls=${r.calls} errors=${r.errors} in=${r.inputTokens} out=${r.outputTokens} $${r.costUsd} tools=${JSON.stringify(r.tools)}`);
}
writeFileSync(join(OUT, 'summary.json'), JSON.stringify(rows, null, 2));
