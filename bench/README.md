# Benchmark

**TL;DR:** With Claude Sonnet 5.5, our MCP solved all fixture tasks (100%). Compared with claude-in-chrome, it used 72% fewer input tokens and 64% fewer tool calls, ran 3.5× faster, and cost 55% less per task. Compared with Playwright MCP and chrome-devtools-mcp, it used 64–70% fewer tokens and about half the calls. The page snapshots are 2-3× smaller than those of chrome-devtools-mcp and Playwright MCP, and about 3× smaller than those of claude-in-chrome. Our snapshots are the only ones that see into iframes and shadow DOM while they keep hidden injection text out.

Date: 2026-10-16. Fixtures: `fixtures/` (16 hard-case pages, success is checked by the server). Versions: chrome-devtools-mcp 1.11.0, @playwright/mcp 0.0.83, claude-in-chrome extension 1.0.100 + Claude Code 2.1.301, ours = `prototype/` (this repo).

## L1: what the agent must read to see a page (no LLM)

`node bench/snapshot-bench.mjs` (stdio servers), `node bench/cic-probe.mjs` (claude-in-chrome through `claude -p --chrome`: navigate + read_page).

| | ours | chrome-devtools-mcp | playwright-mcp | claude-in-chrome |
|---|---|---|---|---|
| tokens to see all 16 pages | **2,438** | 5,536 | 8,875 | 7,160 |
| pages where all needed content is visible | **16/16** | 16/16 | 16/16 | 13/16 (no iframe content, no shadow DOM) |
| hidden (display:none) injection text fed to the model | **no** | no | no | **yes** |
| tool definitions (tokens / tools) | **1,881 / 10** | 7,155 / 32 | 5,072 / 25 | ~6,900 / 22 |

Per page: `results/snapshot-bench.md`, `results/cic-probe.json`. Raw outputs: `results/snapshots/`.

## L2: agent runs (Claude Code, Sonnet 5.5, 16 tasks × 2 runs)

`node bench/agent-bench.mjs --harness claude --servers ... --runs 2`. Each run: fresh fixture server, built-in tools off (`--tools ""`), only one browser MCP. Tokens are from Claude Code's own usage report.

| server | success | input tokens / task | tool calls / task | time / task | cost / task |
|---|---|---|---|---|---|
| **ours** (final code, `claude-ours-v3`) | **32/32 (100%)** | **30.5k** | **3.2** | **11.0 s** | **$0.025** |
| ours (frozen code before the schema fix, `claude-ours-v2`) | **32/32 (100%)** | **38.0k** | **3.8** | **13.5 s** | **$0.029** |
| playwright-mcp | 32/32 (100%) | 84.8k | 7.8 | 27.0 s | $0.039 |
| chrome-devtools-mcp | 32/32 (100%) | 100.7k | 6.7 | 20.7 s | $0.041 |
| claude-in-chrome | 28/32 (88%) | 109.9k | 8.9 | 38.8 s | $0.055 |

Per-task matrix: `results/agent-claude-sonnet.md` (all four servers; there the `ours` row is from code that changed during the run).

Failures and causes:

- **claude-in-chrome / dialogs (0/2):** the native `confirm()` froze the tab. `Input.dispatchMouseEvent` timed out after 30 s, and every later screenshot timed out too. The extension only handles `beforeunload` dialogs. Ours accepts dialogs by policy and reports them as events.
- **claude-in-chrome / file-upload (0/2):** `file_upload` refused the sample file because the session could not read it. That is partly our harness: built-in tools are off, so no file is "shared" with the session. It is still a real difference: ours uses an explicit upload-root allowlist instead.
- **ours / hover-menu-keyboard (0/2 in the first run):** `select` on a custom keyboard-only combobox set `.value` and reported success, but the widget did not commit. Fixed: `select` now acts like a user (type → option click → keyboard fallback) and checks the commit. It passes in v2 and v3.

## L2: Codex CLI (pending)

`node bench/agent-bench.mjs --harness codex --servers ours,chrome-devtools-mcp,playwright-mcp --tag codex-default` (resumes; only missing runs execute).

- The first Codex run found a real portability bug: Codex silently drops a tool whose JSON schema has `anyOf` unions or tuple `items`. So `act` was invisible, and the agent reported "the tools cannot fill fields". The schemas are now portable, and a test guards this.
- The ChatGPT usage limit stopped the run (17 runs). Valid completed rows so far: chrome-devtools-mcp 10/10, playwright-mcp 10/10 (`results/agent/codex-default`). Codex input tokens include a large cached system prompt, so the report also shows uncached input.

## Real sites (`bench/real/`)

better-browser-mcp (extension mode, `BBM_GUARD=shop-social`) against claude-in-chrome in the user's real Chrome profile, same prompt, Sonnet 5.5, run one after the other. A script checks each run against ground truth: the HN API, the live product page, the cart against a saved baseline (the agent's item is removed after the run). A watchdog stops a claude-in-chrome run that tries to click a purchase or publish control. Results stay local (`bench/real/results/`, gitignored); `score.py` writes the summary.

| Task | better-browser-mcp | claude-in-chrome |
|---|---|---|
| Hacker News: top story and 3 top comments | 3/3 · 4 calls · 35k | 3/3 · 5 calls · 75k |
| Amazon: find a USB-C hub | 3/3 · 2 calls · 45k | 3/3 · 8 calls · 163k |
| Amazon: add it to the cart | 3/3 · 4 calls · 76k | 3/3 · 12 calls · 217k |

What the real sites taught (lessons L012–L015): a click that did nothing reported ✓; long modal editing cost 3× tokens until snapshots were scoped to the dialog; focus and tab stealing; a password manager's iframe made Chrome drop the debugger.

Private tasks run the same way from `bench/private/` (not in git): a county property record, a 10-post social draft with media (never posted), and an internal web app. They use personal accounts and private URLs, so their prompts and results stay local.

## Method notes and limits

- One model family per harness and 2 runs per cell: small samples. Treat differences under ~15% as noise.
- Fixture pages are synthetic and local. Real sites add latency, auth and anti-bot measures.
- Success is checked on the server, never from the agent's claim. The prompt-injection task also fails a run on any exfil hit or click on "Delete account". No run had a violation.
- claude-in-chrome uses the user's real Chrome (serial runs). The other servers use headless Chromium/Chrome with a temporary profile.
