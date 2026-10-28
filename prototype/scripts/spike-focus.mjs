// Spike for L014: click latency of an agent tab that is NOT in front, in extension mode, headful.
// node scripts/spike-focus.mjs
import { randomBytes } from 'node:crypto';
import { startServer } from '../../fixtures/server.mjs';
import { startRelay } from '../src/relay.ts';
import { Controller } from '../src/controller.ts';
import { launchWithExtension } from '../test/helpers/extension.mjs';

const srv = await startServer({ port: 0 });
const token = randomBytes(16).toString('hex'),
  port = 9341;
const relay = startRelay({ port, token, timeoutMs: 30000, log: () => {} });
const chromium = await launchWithExtension({ token, port, headless: false });
const browser = await relay;
const c = new Controller(browser, { front: false });
await c.init();

// SW handle to move tabs/windows like a user would.
const { targetInfos } = await chromium.conn.send('Target.getTargets');
const sw = targetInfos.find((t) => t.type === 'service_worker');
const { sessionId: swS } = await chromium.conn.send('Target.attachToTarget', { targetId: sw.targetId, flatten: true });
const swEval = async (expr) => (await chromium.conn.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, swS)).result?.value;

// The "user" tab: active, in a focused window.
const userTab = await swEval(`chrome.tabs.query({active:true,lastFocusedWindow:true}).then(t=>t[0].id)`);
const userWin = await swEval(`chrome.tabs.get(${userTab}).then(t=>t.windowId)`);
await swEval(`chrome.windows.update(${userWin},{left:0,top:0,width:1000,height:800,focused:true})`);

async function measure(label) {
  const times = [];
  for (let i = 0; i < 5; i++) {
    await c.navigate(`${srv.base}/login-form/`);
    const t = Date.now();
    await c.act([{ click: 'text=Sign in' }], { snapshot: 'none' });
    times.push(Date.now() - t);
  }
  const ts = Date.now();
  const shot = await (await c.tab()).screenshot({});
  const sms = Date.now() - ts;
  console.log(`   screenshot ${sms} ms, ${shot.width}x${shot.height}, ${shot.data.length} b64 chars`);
  const active = await swEval(`chrome.tabs.query({active:true,lastFocusedWindow:true}).then(t=>t[0].id)`);
  console.log(`${label.padEnd(44)} click ms: ${times.join(', ')}   user tab still active: ${active === userTab}`);
}

// (a) background tab in the user's window
const sid = await c.newTab('about:blank');
await swEval(`chrome.tabs.update(${userTab},{active:true})`);
await measure('(a) background tab, same window');

// (b) own window, unfocused, fully behind the user window
await swEval(`chrome.windows.create({tabId:${c.tabs.get(sid).targetId},focused:false,left:0,top:0,width:1000,height:800})`);
await swEval(`chrome.windows.update(${userWin},{focused:true})`);
await measure('(b) own window, hidden behind the user window');

// (c) own window beside the user window
await swEval(`chrome.tabs.get(${c.tabs.get(sid).targetId}).then(t=>chrome.windows.update(t.windowId,{left:1010,top:0,width:700,height:800}))`);
await swEval(`chrome.windows.update(${userWin},{focused:true})`);
await measure('(c) own window, beside the user window');

await browser.close().catch(() => {});
await chromium.close();
await srv.close();
process.exit(0);
