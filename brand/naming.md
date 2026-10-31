# Naming: replace "better-browser-mcp"

Date: 2026-10-31. Status: **bopbop** selected. Claimed: npm `bopbop`, domain `bopbop.dev`. Waiting: the user's voice test, GitHub org `bopbop-dev`.

## Decision: bopbop

| check | result |
|---|---|
| npm | `bopbop` free, `browser-bopbop` free |
| domain | `bopbop.dev` free (RDAP 404), `.com` taken |
| voice, synthetic (Samantha, Daniel, Karen → Whisper base.en) | 3/3 |
| voice, user's own | pending |
| USPTO | no mark in classes 9/42. Live BOPBOP marks are for apparel, leather and jewelry only (classes 14/18/25: serial 98524946 live, 99421872 pending) |
| GitHub | no collision (`cloutwish/bop`, 0★) |
| fresh-model recall (`claude -p`, Sonnet) | NONE |
| agent routing: stub MCP `bopbop`, `claude -p "Use bopbop to open example.com…"`, 5 runs + 5 runs with "bop bop" | 10/10 first real call `mcp__bopbop__navigate` |
| tokens (tiktoken o200k, approximate) | 2 |

Surfaces: `npx bopbop` · `claude mcp add bopbop -- npx -y bopbop` · tab chip `Bopbop:GW44` · tool `mcp__bopbop__act` · native host `dev.bopbop.host`.

Limits: the routing test had only the stub server and the built-in tools (no other browser MCP). The USPTO result comes from aggregator sites, not TSDR. Different goods classes lower the risk but do not remove it.

### Rounds after round 1

- Round 3 (direction 2 real words + direction 3 invented, 115 names): voice 3/3 for usher, kin, minder, beagle, tabkin, kinta, kinbo, tabdo, bevo. The user found them too plain ("misses the Gen Z feel").
- Round 4 (Gen Z words): voice 3/3 for zoomies, gremlin, critter, sidequest, bopbop, and others. gremlin collides with Apache Gremlin and gremlins.js.
- Round 5 (sounds like "beepboop"): voice 3/3 for tapbop, bopbop, blipbloop. beepboop 2/3 (bare npm taken). beepbop 0/3. Names that end in -bot or -r fail ("but", "beeper").

## Why a new name

- The npm name `better-browser-mcp` belongs to another person (samuelchung, v0.2.0).
- The name is generic.
- The name shows on 5 surfaces: `npx <name>`, the MCP key (`mcp__<name>__act`), the tab chip (`<Name>:GW44`), the Chrome Web Store title, and the native messaging host ID (`com.<name>.host`).
- The user dictates by voice and says "use bbm" (~300 times in the sessions). The new name must be short and must survive speech-to-text.

## Rubric

Hard filters (one failure = cut):
1. npm name is free (`npm view` gives E404).
2. `.dev` or `.com` is free (Google RDAP 404, Verisign whois "No match").
3. No live USPTO mark in classes 9/42 for software.
4. No important GitHub, Chrome Web Store or MCP collision.
5. No trademark terms (Chrome, Google, Claude).
6. 6 characters or fewer ("as short as chrome").
7. Voice test: `say` (Samantha, Daniel, Karen) → Whisper `base.en`, sentence "Use <name> to open the dashboard.". 3/3 correct = pass.

Soft score: positioning fit (lean and fast, quiet helper), how the tab chip looks, fresh-model recall (no strong existing meaning).

## Results

Round 1: short real words. All are taken on npm: wren, kite, wisp, skim, dart, magpie, tabby, lark, tern, otter, quill, perch and more.

Voice test (correct of 3):

| name | voice | what Whisper heard when wrong |
|---|---|---|
| **tabkin** | **3/3** | — |
| **perch** | **3/3** | — |
| tabpup | 2/3 | tab pop |
| tabhop | 2/3 | tat hop |
| tabelk | 2/3 | tab help |
| quill | 2/3 | cool |
| otter | 2/3 | auto |
| tabjet | 1/3 | TabJit |
| tabcub | 1/3 | tab cup |
| deftab | 0/3 | dev tab, death tab |
| tern | 0/3 | turn |
| tabmate, tabowl, owltab, tabbot, tabbud, tabyak, tabkoi, tabzen, tabjay | 0/3 | tablet, Alt tab, tabs and, ... |

Finalists, deep checks:

| name | npm | .dev | .com | USPTO / web | model recall | result |
|---|---|---|---|---|---|---|
| **tabkin** | free | free | taken | no product found; "Tabkit" (a new-tab extension) is near | NONE | **passes all filters** |
| perch | taken (`perch-mcp` free) | taken | taken | **live application PERCH, serial 98804923, classes 9/42, AI software (Nevermind Technology)** | Perch CMS, Perch Security | fails filter 3 |
| tabhop | free | free | taken | several "Tab Hopper" / "Tab Hop" Chrome extensions | NONE | fails filter 4 (crowded) |

## Limits of the checks

- Whisper used synthetic voices, not the user's voice. Do a test with real dictation before the final decision.
- The USPTO check came from a web search of aggregator sites, not from TSDR directly.
- The Chrome Web Store check came from a web search. It is not complete.
- Domain and npm status can change. Register before the public announcement.

## Learned

- Compounds of `tab` + a word with hard consonants survive speech. Soft endings (-mate, -owl, deft-) do not.
- Every one-word brand of 6 characters or fewer is taken on npm. A real word requires `<word>-mcp` or a scope.
