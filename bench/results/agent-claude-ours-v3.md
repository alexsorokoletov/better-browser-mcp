### claude (sonnet)

| server | success | input tok / task | uncached input / task | output tok / task | tool calls / task | time / task (s) | cost / task ($) |
|---|---|---|---|---|---|---|---|
| ours | 32/32 (100%) | 30,496 | 4,697 | 340 | 3.2 | 11.0 (median 9.9) | 0.025 |

Per task (passes/runs, mean tool calls, mean input k-tokens):

| task | ours |
|---|---|
| iframe-same-origin | ✅ 2/2 · 2.0 calls · 21k |
| login-form | ✅ 2/2 · 2.5 calls · 24k |
| iframe-cross-origin | ✅ 2/2 · 2.0 calls · 21k |
| long-form | ✅ 2/2 · 2.0 calls · 23k |
| shadow-dom | ✅ 2/2 · 2.5 calls · 24k |
| spa-delayed | ✅ 2/2 · 3.0 calls · 29k |
| new-tab | ✅ 2/2 · 3.0 calls · 28k |
| virtual-list | ✅ 2/2 · 3.0 calls · 33k |
| dialogs | ✅ 2/2 · 5.0 calls · 45k |
| file-upload | ✅ 2/2 · 2.0 calls · 21k |
| canvas | ✅ 2/2 · 4.0 calls · 37k |
| prompt-injection | ✅ 2/2 · 2.0 calls · 22k |
| hover-menu-keyboard | ✅ 2/2 · 5.0 calls · 44k |
| drag-reorder | ✅ 2/2 · 3.0 calls · 29k |
| data-extraction | ✅ 2/2 · 4.0 calls · 42k |
| rich-text | ✅ 2/2 · 6.0 calls · 45k |


