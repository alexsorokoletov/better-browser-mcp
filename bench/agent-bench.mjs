// Level-2 benchmark: an LLM agent solves each fixture task through one browser MCP.
// Usage:
//   node bench/agent-bench.mjs --harness claude --servers ours,chrome-devtools-mcp,playwright-mcp,claude-in-chrome \
//        --tasks all --runs 1 --concurrency 3 [--model sonnet] [--tag name]
//   node bench/agent-bench.mjs --harness codex --servers ours,chrome-devtools-mcp,playwright-mcp
// Each run gets its own fixture server (random port), so runs can go in parallel.
// Success is checked server-side (bench/check.mjs), never from the agent's own claim.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, appendFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../fixtures/server.mjs';
import { checkTask, TASKS } from './check.mjs';
import { SERVERS } from './servers.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
  return acc;
}, []));
const HARNESS = args.harness || 'claude';
const SERVER_NAMES = (args.servers || 'ours').split(',');
const TASK_IDS = args.tasks && args.tasks !== 'all' ? args.tasks.split(',') : TASKS.map((t) => t.id);
const RUNS = +(args.runs || 1);
const CONC = +(args.concurrency || 3);
const MODEL = args.model || (HARNESS === 'claude' ? 'sonnet' : undefined);
const TIMEOUT = +(args.timeout || 420) * 1000;
const TAG = args.tag || new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const OUT = new URL(`./results/agent/${TAG}/`, import.meta.url);
mkdirSync(OUT, { recursive: true });
const RAW = join(OUT.pathname, 'raw');
mkdirSync(RAW, { recursive: true });

const UPLOAD_DIR = join(tmpdir(), 'bbm-uploads');
mkdirSync(UPLOAD_DIR, { recursive: true });
const SAMPLE = join(UPLOAD_DIR, 'bench-sample.txt');
writeFileSync(SAMPLE, 'benchmark sample file\n');

const SUFFIX = `\n\nRules: use only the browser tools you have. You run unattended: do not ask questions, finish the task on your own. A sample file you may upload is at ${SAMPLE}. When the task is complete, reply DONE. If you cannot complete it, reply FAILED and the reason.`;

// claude-in-chrome is built into Claude Code (--chrome), not a stdio server.
const CIC = 'claude-in-chrome';

function claudeCmd(server, prompt, cwd) {
  const cfg = join(cwd, 'mcp.json');
  const mcp = server === CIC ? { mcpServers: {} } : { mcpServers: { [server]: { command: SERVERS[server].command, args: SERVERS[server].args, env: SERVERS[server].env || {} } } };
  writeFileSync(cfg, JSON.stringify(mcp));
  return ['claude', ['-p', prompt, '--model', MODEL, '--output-format', 'stream-json', '--verbose', '--tools', '',
    '--strict-mcp-config', '--mcp-config', cfg, '--setting-sources', 'project', '--no-session-persistence',
    // no permission bypass: allow only the one browser MCP under test (built-in tools are off via --tools "")
    '--allowedTools', `mcp__${server}__*`, '--max-budget-usd', String(args.budget || 2),
    server === CIC ? '--chrome' : '--no-chrome']];
}

function tomlStr(s) { return JSON.stringify(s); }
function codexCmd(server, prompt) {
  if (server === CIC) throw new Error('claude-in-chrome needs the claude harness');
  const s = SERVERS[server];
  const name = server.replace(/[^a-z0-9]/gi, '_');
  const env = Object.entries(s.env || {}).map(([k, v]) => `${k}=${tomlStr(v)}`).join(',');
  const a = ['exec', '--json', '--skip-git-repo-check', '--ephemeral', '-s', 'read-only',
    '-c', 'features.plugins=false', '-c', 'approval_policy="never"',
    '-c', `mcp_servers.${name}.command=${tomlStr(s.command)}`,
    '-c', `mcp_servers.${name}.args=[${s.args.map(tomlStr).join(',')}]`,
    '-c', `mcp_servers.${name}.startup_timeout_sec=60`, '-c', `mcp_servers.${name}.tool_timeout_sec=120`,
    '-c', `mcp_servers.${name}.default_tools_approval_mode="approve"`];
  if (env) a.push('-c', `mcp_servers.${name}.env={${env}}`);
  if (MODEL) a.push('-m', MODEL);
  a.push(prompt);
  return ['codex', a];
}

function parseClaude(lines) {
  const m = { toolCalls: 0, tools: {}, turns: 0, costUsd: null, inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0, result: '', toolResultChars: 0 };
  for (const l of lines) {
    let d; try { d = JSON.parse(l); } catch { continue; }
    if (d.type === 'assistant') {
      for (const c of d.message?.content || []) if (c.type === 'tool_use') { m.toolCalls++; m.tools[c.name] = (m.tools[c.name] || 0) + 1; }
    } else if (d.type === 'user') {
      for (const c of d.message?.content || []) if (c.type === 'tool_result') {
        const parts = Array.isArray(c.content) ? c.content : [{ type: 'text', text: String(c.content ?? '') }];
        for (const p of parts) m.toolResultChars += p.type === 'text' ? p.text.length : 0;
      }
    } else if (d.type === 'result') {
      m.turns = d.num_turns; m.costUsd = d.total_cost_usd; m.result = String(d.result || '').slice(-300);
      const u = d.usage || {};
      m.inputTokens = u.input_tokens || 0; m.outputTokens = u.output_tokens || 0;
      m.cacheRead = u.cache_read_input_tokens || 0; m.cacheWrite = u.cache_creation_input_tokens || 0;
      m.isError = d.is_error;
    }
  }
  m.totalInput = m.inputTokens + m.cacheRead + m.cacheWrite;
  return m;
}

function parseCodex(lines) {
  const m = { toolCalls: 0, tools: {}, turns: 0, costUsd: null, inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0, result: '', toolResultChars: 0 };
  for (const l of lines) {
    let d; try { d = JSON.parse(l); } catch { continue; }
    if (d.type === 'item.completed') {
      const it = d.item || {};
      if (it.type === 'mcp_tool_call') {
        m.toolCalls++; m.tools[it.tool] = (m.tools[it.tool] || 0) + 1;
        const r = it.result?.content || [];
        for (const p of r) if (p.type === 'text') m.toolResultChars += p.text.length;
      } else if (it.type === 'command_execution') { m.tools.shell = (m.tools.shell || 0) + 1; }
      else if (it.type === 'agent_message') m.result = String(it.text || '').slice(-300);
    } else if (d.type === 'turn.completed') {
      m.turns++;
      const u = d.usage || {};
      m.inputTokens += u.input_tokens || 0; m.cacheRead += u.cached_input_tokens || 0; m.outputTokens += u.output_tokens || 0;
    } else if (d.type === 'turn.failed' || d.type === 'error') m.error = d.error?.message || d.message;
  }
  m.totalInput = m.inputTokens; // codex input_tokens already includes cached
  return m;
}

function run(cmd, argv, cwd, rawFile) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const p = spawn(cmd, argv, { cwd, env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; if (err.length > 50000) err = err.slice(-20000); });
    const timer = setTimeout(() => { p.kill('SIGTERM'); setTimeout(() => p.kill('SIGKILL'), 5000); }, TIMEOUT);
    p.on('close', (code) => {
      clearTimeout(timer);
      writeFileSync(rawFile, out);
      if (err) writeFileSync(rawFile + '.stderr', err);
      resolve({ code, ms: Date.now() - t0, lines: out.split('\n').filter(Boolean), timedOut: Date.now() - t0 >= TIMEOUT });
    });
  });
}

async function one(server, taskId, i) {
  const task = TASKS.find((t) => t.id === taskId);
  const srv = await startServer({ port: 0 });
  const cwd = mkdtempSync(join(tmpdir(), 'bench-agent-'));
  const prompt = task.prompt.replaceAll('{BASE}', srv.base) + SUFFIX;
  const [cmd, argv] = HARNESS === 'claude' ? claudeCmd(server, prompt, cwd) : codexCmd(server, prompt);
  const rawFile = join(RAW, `${HARNESS}--${server}--${taskId}--${i}.jsonl`);
  const r = await run(cmd, argv, cwd, rawFile);
  const m = HARNESS === 'claude' ? parseClaude(r.lines) : parseCodex(r.lines);
  const state = await (await fetch(`${srv.base}/api/state?task=${taskId}`)).json();
  const check = checkTask(taskId, state);
  await srv.close();
  const row = { harness: HARNESS, model: MODEL || 'default', server, task: taskId, run: i, pass: check.pass, details: check.details, ms: r.ms, timedOut: r.timedOut, exit: r.code, ...m };
  appendFileSync(join(OUT.pathname, 'results.jsonl'), JSON.stringify(row) + '\n');
  console.log(`${check.pass ? 'PASS' : 'FAIL'} ${server.padEnd(20)} ${taskId.padEnd(20)} #${i} ${(r.ms / 1000).toFixed(0)}s calls=${m.toolCalls} in=${m.totalInput} out=${m.outputTokens} $${m.costUsd ?? '-'}${check.pass ? '' : ' :: ' + JSON.stringify(check.details).slice(0, 160)}${m.error ? ' ERR ' + m.error.slice(0, 120) : ''}`);
  return row;
}

// Queue: claude-in-chrome shares the user's real Chrome, so it runs one at a time.
const jobs = [];
for (let i = 0; i < RUNS; i++) for (const t of TASK_IDS) for (const s of SERVER_NAMES) jobs.push({ s, t, i });
const done = existsSync(join(OUT.pathname, 'results.jsonl'))
  ? new Set(readFileSync(join(OUT.pathname, 'results.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l); return `${r.server}|${r.task}|${r.run}`; }))
  : new Set();
const todo = jobs.filter((j) => !done.has(`${j.s}|${j.t}|${j.i}`));
console.log(`${HARNESS}: ${todo.length} runs (${done.size} already done) -> ${OUT.pathname}`);
let cicBusy = false;
const workers = Array.from({ length: CONC }, async () => {
  for (;;) {
    const idx = todo.findIndex((j) => j.s !== CIC || !cicBusy);
    if (idx < 0) { if (!todo.length) return; await new Promise((r) => setTimeout(r, 500)); continue; }
    const j = todo.splice(idx, 1)[0];
    if (j.s === CIC) cicBusy = true;
    try { await one(j.s, j.t, j.i); } catch (e) { console.error('run error', j, e.message); }
    finally { if (j.s === CIC) cicBusy = false; }
  }
});
await Promise.all(workers);
console.log('done');
