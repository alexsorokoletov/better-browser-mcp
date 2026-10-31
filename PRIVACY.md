# Privacy policy: better-browser-mcp relay extension

Last updated: 2026-10-29

The better-browser-mcp relay extension connects Chrome to a better-browser-mcp server that runs on your own computer. It lets an AI agent that you run (for example Claude Code or Codex) control the tabs that the agent opens.

## What the extension sends, and where

- The extension connects only to `ws://127.0.0.1` on a port that you set (default 9333–9362). It does not connect to any other server.
- Page content, screenshots and network data from agent tabs go only to that local server. The local server gives them to the agent that you run. What your agent does with that data is controlled by the agent and its provider, not by this extension.
- The extension has no analytics, no telemetry, no ads and no remote code.

## What the extension stores

- The pairing token, the port and the cleanup setting, in `chrome.storage.local` on your computer. The token never leaves the browser; only HMAC proofs made from it are sent to the local server.

## What the extension does not do

- It does not sell or share data with third parties.
- It does not collect personal data for the developer. The developer receives nothing from the extension.

## Contact

Open an issue: https://github.com/alexsorokoletov/bopbop/issues
