<p align="center"><img src="brand/icon-128.png" width="96" alt="better-browser-mcp icon"></p>

<h1 align="center">better-browser-mcp</h1>

<p align="center">Browser control for AI agents that uses fewer tokens, finishes in fewer calls, and works next to you in your own Chrome.</p>

<p align="center">
  <a href="prototype/INSTALL.md">Install</a> ·
  <a href="bench/README.md">Benchmark</a> ·
  <a href="lessons/lessons.md">Lessons</a>
</p>

---

## Results

**16 hard-case pages** (iframes, shadow DOM, dialogs, popups, uploads, a prompt-injection trap). Claude Sonnet 5.5, 2 runs per page, success checked by the server:

| | success | input tokens / task | calls / task | time / task | cost / task |
|---|---|---|---|---|---|
| **better-browser-mcp** | **32/32** | **30.5k** | **3.2** | **11.0 s** | **$0.025** |
| Playwright MCP | 32/32 | 84.8k | 7.8 | 27.0 s | $0.039 |
| chrome-devtools-mcp | 32/32 | 100.7k | 6.7 | 20.7 s | $0.041 |
| claude-in-chrome | 28/32 | 109.9k | 8.9 | 38.8 s | $0.055 |

**Real sites in a real Chrome profile**, against claude-in-chrome. Medians of 3 runs, each checked against ground truth (the HN API, the live product page, the cart), never against the agent's own claim:

| Task | better-browser-mcp | claude-in-chrome |
|---|---|---|
| Hacker News: top story and 3 top comments | 3/3 · 4 calls · 35k tokens | 3/3 · 5 calls · 75k |
| Amazon: find a USB-C hub by price, rating, ports | 3/3 · 2 calls · 45k | 3/3 · 8 calls · 163k |
| Amazon: add it to the cart (checkout is blocked) | 3/3 · 4 calls · 76k | 3/3 · 12 calls · 217k |

Private tasks run the same way from `bench/private/` (not in git): a county property record, a 10-post social draft with media (never posted), and an internal web app. They use personal accounts and private URLs, so their prompts and results stay local.

Small samples: treat differences under ~15% as noise. Method, raw runs and failures: [`bench/README.md`](bench/README.md).

## What is different

**Fewer calls, fewer tokens**
- `navigate` returns the page. `act` runs a batch of steps and returns only what changed. A login is 2 calls.
- A compact snapshot (`role "name" [e5] states`) that sees into iframes and shadow DOM and leaves hidden text out.
- Inside an open dialog or composer, snapshots and diffs cover only that dialog.
- `extract` returns tables and records as JSON. `read format=markdown` returns the main content of a page as Markdown.
- 13 tools, about 2.5k tokens of definitions (others: 5–7k). The schemas work in Claude Code and Codex.

**Works next to you, in your Chrome**
- Extension mode drives your real profile. The agent never takes your active tab or focuses a window. Its tabs are in an **Agent** tab group.
- Up to 30 agent sessions share one Chrome. Each session sees only its own tabs. After an extension reload or a Chrome restart, the next call reconnects by itself (no `/mcp`).
- When a session ends, the agent's tabs close, except the ones that you used.
- Fields in agent tabs opt out of password managers, so their menus do not break the session. If one appears, the agent recovers.

**Honest results**
- A click on a submit button must change something. If nothing changes, it gets one keyboard retry, else it reports `⚠ no effect`, not ✓.
- Custom dropdowns are verified after selection. Dialogs are handled by policy and reported as events.

**Safe by default**
- `BBM_GUARD=shop-social` blocks Buy now, Place order, checkout pages and Post buttons: in the step checks, inside the page, and in the browser.
- Hidden text never reaches the model. Lines that look like prompt injection are flagged.
- Cookie and credential header values are shortened. Files are saved only by name, into one folder.
- Local only: stdio and a paired local WebSocket. No cloud relay.

**Developer tools**
- `network`: time, size, timing phases, headers and cookies per request, filters, HAR export.
- `emulate`: Chrome's responsive mode with device presets, dark mode, network and CPU throttling.
- `perf`: Web Vitals with ratings, long tasks, the slowest and largest resources, heap and DOM size.

## Quick start

```bash
cd prototype && bun install          # or: npm install
claude mcp add -s user bbm -- bun "$PWD/src/server.ts"
# Codex: codex mcp add bbm -- bun "$PWD/src/server.ts"
```

The default is extension mode. Build, load and pair the Chrome extension using [`prototype/INSTALL.md`](prototype/INSTALL.md).

Then ask the agent: *"Use bbm. Open https://example.com and tell me the page heading."*

For a fresh headless browser instead, set `BBM_MODE=launch`. All settings and tools: [`prototype/README.md`](prototype/README.md).

## Repository

| Path | Contents |
|---|---|
| [`prototype/`](prototype/) | The MCP server (Node or Bun), the page agent and the relay extension |
| [`bench/`](bench/) | Fixture benchmark (Claude Code, Codex) and real-site benchmark (`bench/real/`) |
| [`fixtures/`](fixtures/) | Hard-case test pages with a state API that checks success on the server |
| [`lessons/`](lessons/lessons.md) | What failed, why, and the fix: one record per lesson, with a regression test |
| [`brand/`](brand/) | Icon and social cards |

