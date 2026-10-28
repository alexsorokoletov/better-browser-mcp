// Drive better-browser-mcp (extension mode) directly: node bbm-client.mjs '[["navigate",{"url":"..."}],["read",{}]]'
import { connect } from './mcp-client.mjs';

const calls = JSON.parse(process.argv[2]);
const mcp = await connect({ stderr: 'inherit' });
// Checkers work in their own fresh tab and close it after, so they never touch an existing tab
// (the agent's draft or a tab the user opened from an agent tab). BBM_USE_EXISTING=1 opts out.
const fresh = !process.env.BBM_USE_EXISTING;
if (fresh) await mcp.call('tabs', { action: 'new' });
for (const [name, args] of calls) {
  const r = await mcp.call(name, args);
  console.log(`### ${name} ${r.isError ? '(error)' : ''}`);
  for (const c of r.content || []) console.log(c.type === 'text' ? c.text : `[${c.type}]`);
}
if (fresh) await mcp.call('tabs', { action: 'close' });
mcp.close();
