// MCP server definitions used by the benchmarks. All run headless with a throwaway profile.
import { fileURLToPath } from 'node:url';

const OURS = fileURLToPath(new URL('../prototype/src/server.ts', import.meta.url));

export const SERVERS = {
  ours: {
    command: process.execPath, args: [OURS], env: { BBM_HEADLESS: '1' },
    // returns { text } the agent would see to get an actionable view of the page
    async open(call, url) { return [await call('navigate', { url })]; },
    snapshot: (call) => call('snapshot', {}),
  },
  'chrome-devtools-mcp': {
    command: 'npx', args: ['-y', 'chrome-devtools-mcp@1.11.0', '--headless', '--isolated', '--viewport', '1280x800'],
    async open(call, url) { return [await call('navigate_page', { pageId: 1, type: 'url', url }), await call('take_snapshot', { pageId: 1 })]; },
    snapshot: (call) => call('take_snapshot', { pageId: 1 }),
  },
  'playwright-mcp': {
    command: 'npx', args: ['-y', '@playwright/mcp@0.0.83', '--headless', '--isolated', '--viewport-size', '1280x800'],
    // 0.0.83 writes the navigate snapshot to a file; an agent then calls browser_snapshot
    async open(call, url) { return [await call('browser_navigate', { url }), await call('browser_snapshot', {})]; },
    snapshot: (call) => call('browser_snapshot', {}),
  },
};

/** MCP config JSON for `claude -p --mcp-config` (name -> stdio server). */
export function claudeMcpConfig(name) {
  const s = SERVERS[name];
  return { mcpServers: { [name]: { command: s.command, args: s.args, env: s.env || {} } } };
}
