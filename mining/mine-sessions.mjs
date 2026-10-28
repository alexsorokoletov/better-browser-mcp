// Mine Claude Code session transcripts for browser-tool usage. LOCAL ONLY: writes to ../local/ (gitignored).
// Usage: node mining/mine-sessions.mjs [--projects substr,substr] [--limit N] [--out local/mine-<tag>]
// Every free-text value passes through scrub() before it is written.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { scrub, scrubUrl } from './scrub.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => (x.startsWith('--') ? [...a, [x.slice(2), arr[i + 1]]] : a), []));
const ROOT = join(homedir(), '.claude', 'projects');
const OUT = new URL(`../${args.out || 'local/mine'}/`, import.meta.url).pathname;
const NAMES = existsSync(new URL('../local/names.txt', import.meta.url)) ? readFileSync(new URL('../local/names.txt', import.meta.url), 'utf8').split('\n').map((s) => s.trim()).filter(Boolean) : [];
const S = (t, n) => scrub(t, { names: NAMES, maxLen: n, prose: true });
const PREFIX = /^mcp__claude-in-chrome__/;
// harness-injected "user" turns are not user intents
const SYSTEM_TEXT = /^(<(command|local-command|system-reminder|task-notification|agent-message|cross-session-message)|Another Claude session|Base directory for this skill|# Claude in Chrome|\[Request interrupted|Caveat:)/;
const hid = (s) => createHash('sha256').update(s).digest('hex').slice(0, 10);

function jsPurpose(code = '') {
  const tags = [];
  const T = (re, t) => { if (re.test(code)) tags.push(t); };
  T(/\.click\(\)|dispatchEvent\(new (Mouse|Pointer)Event/, 'click');
  T(/\.value\s*=|nativeInputValueSetter|setRangeText|execCommand\(['"]insertText/, 'fill');
  T(/querySelector(All)?\(|getElementsBy|closest\(|XPathResult/, 'query-dom');
  T(/innerText|textContent|outerHTML|innerHTML(?!\s*=)/, 'read-text');
  T(/getBoundingClientRect|offsetTop|scrollHeight/, 'geometry');
  T(/scroll(To|By|IntoView)|scrollTop\s*=/, 'scroll');
  T(/fetch\(|XMLHttpRequest|axios/, 'network');
  T(/localStorage|sessionStorage|indexedDB|document\.cookie/, 'storage');
  T(/getComputedStyle|\.style\./, 'style');
  T(/window\.(location|history)|location\.href\s*=/, 'navigation');
  T(/__REACT|__vue|_reactRootContainer|ng\.|__NEXT_DATA__|redux|store\.getState/i, 'framework-state');
  T(/console\.|performance\./, 'diagnostics');
  T(/shadowRoot/, 'shadow-dom');
  T(/contentDocument|contentWindow|frames\[/, 'iframe');
  T(/setTimeout|await new Promise|waitFor/, 'wait');
  T(/files|DataTransfer|FileReader|Blob\(/, 'files');
  return tags.length ? tags : ['other'];
}

function errClass(t) {
  const s = t.toLowerCase();
  if (/timed? ?out|timeout/.test(s)) return 'timeout';
  if (/not connected|extension.*(not|isn't)|no browser|connection|disconnected|bridge/.test(s)) return 'connection';
  if (/permission|not allowed|blocked|denied|refused/.test(s)) return 'permission';
  if (/dialog|alert|confirm\(|beforeunload/.test(s)) return 'dialog';
  if (/no tab|tab .*(not found|closed|doesn't exist)|invalid tab|tabid/.test(s)) return 'tab';
  if (/detached|target closed|frame was detached/.test(s)) return 'detached';
  if (/not found|no element|could not find|unable to find|ref_\d+.*(invalid|not)/.test(s)) return 'element-not-found';
  if (/navigat/.test(s)) return 'navigation';
  if (/screenshot|capture/.test(s)) return 'screenshot';
  if (/cross-origin|iframe|frame/.test(s)) return 'frame';
  if (/syntaxerror|referenceerror|typeerror|is not defined|unexpected token/.test(s)) return 'js-error';
  if (/upload|file/.test(s)) return 'file';
  return 'other';
}

function inputShape(tool, inp = {}) {
  switch (tool) {
    case 'navigate': return { url: inp.url ? (/^(back|forward)$/.test(inp.url) ? inp.url : scrubUrl(inp.url)) : undefined };
    case 'computer': return { action: inp.action, coord: !!inp.coordinate, ref: !!inp.ref, textLen: inp.text?.length, scroll: inp.scroll_direction };
    case 'javascript_tool': return { purpose: jsPurpose(inp.text || inp.code || ''), len: (inp.text || inp.code || '').length, code: S(inp.text || inp.code || '', 400) };
    case 'browser_batch': return { actions: (inp.actions || []).map((a) => (a.name === 'computer' ? `computer:${a.input?.action}` : a.name)) };
    case 'find': return { query: S(inp.query || '', 120) };
    case 'read_page': return { filter: inp.filter, depth: inp.depth, ref: !!inp.ref_id };
    case 'get_page_text': return {};
    case 'form_input': return { valueType: typeof inp.value };
    default: return Object.fromEntries(Object.keys(inp).map((k) => [k, typeof inp[k]]));
  }
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
}
const humanText = (m) => {
  const c = m?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c) && !c.some((x) => x.type === 'tool_result')) return c.filter((x) => x.type === 'text').map((x) => x.text).join('\n');
  return null;
};

const projects = readdirSync(ROOT).filter((p) => !/^-private-tmp|better-browser-mcp/.test(p) && statSync(join(ROOT, p)).isDirectory())
  .filter((p) => !args.projects || args.projects.split(',').some((s) => p.includes(s)));

mkdirSync(OUT, { recursive: true });
const calls = [], episodes = [];
let sessions = 0;
for (const proj of projects) {
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f.endsWith('.jsonl')) files.push(p); } };
  walk(join(ROOT, proj));
  for (const f of files) {
    const raw = readFileSync(f, 'utf8');
    if (!raw.includes('mcp__claude-in-chrome__')) continue;
    sessions++;
    const sid = hid(f);
    const pending = new Map();
    let lastIntent = null, ep = null;
    const closeEp = () => { if (ep) { episodes.push(ep); ep = null; } };
    for (const line of raw.split('\n')) {
      if (!line) continue;
      let d; try { d = JSON.parse(line); } catch { continue; }
      const ts = Date.parse(d.timestamp) || null;
      if (d.type === 'user') {
        const ht = humanText(d.message);
        if (ht && !SYSTEM_TEXT.test(ht.trim())) { closeEp(); lastIntent = scrub(ht, { names: NAMES, maxLen: 300, prose: true }); }
        for (const c of Array.isArray(d.message?.content) ? d.message.content : []) {
          if (c.type !== 'tool_result' || !pending.has(c.tool_use_id)) continue;
          const call = pending.get(c.tool_use_id); pending.delete(c.tool_use_id);
          const t = textOf(c.content);
          const isErr = !!c.is_error || /^(error|failed)/i.test(t.trim());
          Object.assign(call, {
            ms: ts && call.ts ? ts - call.ts : null, resultChars: t.length,
            images: Array.isArray(c.content) ? c.content.filter((x) => x.type === 'image').length : 0,
            error: isErr, errClass: isErr ? errClass(t) : null, errMsg: isErr ? S(t, 200) : null,
          });
        }
      } else if (d.type === 'assistant') {
        for (const c of Array.isArray(d.message?.content) ? d.message.content : []) {
          if (c.type !== 'tool_use') continue;
          if (!PREFIX.test(c.name)) { if (ep) ep.otherTools.push(c.name.replace(/^mcp__([^_]+)__.*/, 'mcp:$1')); continue; }
          const tool = c.name.replace(PREFIX, '');
          if (!ep) ep = { session: sid, project: proj.replace(/^-Users-[^-]+-/, ''), intent: lastIntent, model: d.message.model, start: ts, calls: [], otherTools: [] };
          const call = { session: sid, project: ep.project, model: d.message.model, sidechain: !!d.isSidechain, tool, ts, input: inputShape(tool, c.input) };
          pending.set(c.id, call); calls.push(call); ep.calls.push(call); ep.end = ts;
        }
      }
    }
    closeEp();
    if (args.limit && sessions >= +args.limit) break;
  }
}
writeFileSync(join(OUT, 'calls.jsonl'), calls.map((c) => JSON.stringify(c)).join('\n'));
writeFileSync(join(OUT, 'episodes.jsonl'), episodes.map((e) => JSON.stringify({ ...e, calls: e.calls.map((c) => `${c.tool}${c.error ? '!' + c.errClass : ''}`) })).join('\n'));
console.log(`projects ${projects.length}, sessions ${sessions}, episodes ${episodes.length}, calls ${calls.length} -> ${OUT}`);
