### claude (sonnet)

| server | success | input tok / task | output tok / task | tool calls / task | time / task (s) | cost / task ($) |
|---|---|---|---|---|---|---|
| playwright-mcp | 32/32 (100%) | 84,819 | 746 | 7.8 | 27.0 (median 24.2) | 0.039 |
| chrome-devtools-mcp | 32/32 (100%) | 100,702 | 799 | 6.7 | 20.7 (median 18.9) | 0.041 |
| ours | 30/32 (94%) | 31,133 | 347 | 3.3 | 14.2 (median 13.8) | 0.023 |
| claude-in-chrome | 28/32 (88%) | 109,893 | 1,267 | 8.9 | 38.8 (median 27.4) | 0.055 |

Per task (passes/runs, mean tool calls, mean input k-tokens):

| task | playwright-mcp | chrome-devtools-mcp | ours | claude-in-chrome |
|---|---|---|---|---|
| login-form | ✅ 2/2 · 6.0 calls · 60k | ✅ 2/2 · 5.0 calls · 92k | ✅ 2/2 · 2.0 calls · 21k | ✅ 2/2 · 8.0 calls · 100k |
| long-form | ✅ 2/2 · 5.0 calls · 64k | ✅ 2/2 · 12.5 calls · 97k | ✅ 2/2 · 2.0 calls · 23k | ✅ 2/2 · 8.0 calls · 138k |
| iframe-same-origin | ✅ 2/2 · 5.0 calls · 55k | ✅ 2/2 · 4.0 calls · 60k | ✅ 2/2 · 2.0 calls · 21k | ✅ 2/2 · 8.5 calls · 94k |
| iframe-cross-origin | ✅ 2/2 · 5.0 calls · 55k | ✅ 2/2 · 4.0 calls · 60k | ✅ 2/2 · 2.0 calls · 21k | ✅ 2/2 · 5.5 calls · 66k |
| shadow-dom | ✅ 2/2 · 8.0 calls · 68k | ✅ 2/2 · 7.0 calls · 111k | ✅ 2/2 · 3.5 calls · 32k | ✅ 2/2 · 9.0 calls · 105k |
| virtual-list | ✅ 2/2 · 4.0 calls · 48k | ✅ 2/2 · 4.0 calls · 82k | ✅ 2/2 · 3.5 calls · 36k | ✅ 2/2 · 9.5 calls · 139k |
| spa-delayed | ✅ 2/2 · 7.0 calls · 80k | ✅ 2/2 · 6.0 calls · 110k | ✅ 2/2 · 3.0 calls · 29k | ✅ 2/2 · 8.0 calls · 85k |
| dialogs | ✅ 2/2 · 8.0 calls · 103k | ✅ 2/2 · 8.0 calls · 138k | ✅ 2/2 · 4.0 calls · 36k | ❌ 0/2 · 9.0 calls · 137k |
| new-tab | ✅ 2/2 · 7.5 calls · 95k | ✅ 2/2 · 6.5 calls · 107k | ✅ 2/2 · 3.0 calls · 28k | ✅ 2/2 · 9.0 calls · 119k |
| file-upload | ✅ 2/2 · 11.0 calls · 131k | ✅ 2/2 · 4.0 calls · 75k | ✅ 2/2 · 2.0 calls · 21k | ❌ 0/2 · 6.0 calls · 65k |
| canvas | ✅ 2/2 · 5.5 calls · 70k | ✅ 2/2 · 6.0 calls · 104k | ✅ 2/2 · 4.0 calls · 36k | ✅ 2/2 · 5.0 calls · 65k |
| hover-menu-keyboard | ✅ 2/2 · 20.5 calls · 241k | ✅ 2/2 · 14.0 calls · 228k | ❌ 0/2 · 9.0 calls · 74k | ✅ 2/2 · 18.5 calls · 209k |
| data-extraction | ✅ 2/2 · 6.5 calls · 88k | ✅ 2/2 · 5.5 calls · 91k | ✅ 2/2 · 3.0 calls · 35k | ✅ 2/2 · 10.0 calls · 123k |
| prompt-injection | ✅ 2/2 · 4.0 calls · 44k | ✅ 2/2 · 4.0 calls · 62k | ✅ 2/2 · 2.0 calls · 22k | ✅ 2/2 · 6.5 calls · 74k |
| drag-reorder | ✅ 2/2 · 7.0 calls · 78k | ✅ 2/2 · 5.0 calls · 92k | ✅ 2/2 · 3.0 calls · 28k | ✅ 2/2 · 9.5 calls · 106k |
| rich-text | ✅ 2/2 · 15.5 calls · 79k | ✅ 2/2 · 11.5 calls · 101k | ✅ 2/2 · 5.5 calls · 37k | ✅ 2/2 · 12.0 calls · 133k |

Failures:

- ours / hover-menu-keyboard #0: "timezone: expected \"Europe/Lisbon\", got null"
- ours / hover-menu-keyboard #1: "timezone: expected \"Europe/Lisbon\", got null"
- claude-in-chrome / dialogs #0: "no submission"
- claude-in-chrome / file-upload #0: "no submission"
- claude-in-chrome / dialogs #1: "no submission"
- claude-in-chrome / file-upload #1: "no submission"


