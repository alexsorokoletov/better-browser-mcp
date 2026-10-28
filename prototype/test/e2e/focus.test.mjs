// L014: side by side with a user, extension mode. The agent never takes the user's tab or window,
// adopts only popups its own actions open, and cleans up its tabs when the session ends.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { startServer } from '../../../fixtures/server.mjs';
import { startRelay } from '../../src/relay.ts';
import { Controller } from '../../src/controller.ts';
import { launchWithExtension } from '../helpers/extension.mjs';

let srv, chromium, browser, c, swEval, userTab;
const PORT = 9352;
async function connect(opts = {}) {
  const token = randomBytes(16).toString('hex');
  await swEval(`chrome.storage.local.set({token:${JSON.stringify(token)},port:${PORT}})`);
  browser = await startRelay({ port: PORT, token, timeoutMs: 30000, log: () => {} });
  c = new Controller(browser, { front: false, ...opts });
  await c.init();
}
before(async () => {
  srv = await startServer({ port: 0 });
  const token = randomBytes(16).toString('hex');
  const relay = startRelay({ port: PORT, token, timeoutMs: 30000, log: () => {} });
  chromium = await launchWithExtension({ token, port: PORT });
  browser = await relay;
  const { targetInfos } = await chromium.conn.send('Target.getTargets');
  const sw = targetInfos.find((t) => t.type === 'service_worker');
  const { sessionId } = await chromium.conn.send('Target.attachToTarget', { targetId: sw.targetId, flatten: true });
  swEval = async (expr) =>
    (await chromium.conn.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, sessionId)).result?.value;
  userTab = await swEval(`chrome.tabs.create({url:${JSON.stringify(srv.base + '/login-form/')},active:true}).then(t=>t.id)`);
  c = new Controller(browser, { front: false });
  await c.init();
});
after(async () => {
  await browser?.close().catch(() => {});
  await chromium?.close();
  await srv?.close();
});

const activeTab = () => swEval('chrome.tabs.query({active:true,lastFocusedWindow:true}).then(t=>t[0]?.id)');

test('the user keeps their active tab while the agent opens tabs and acts', async () => {
  await swEval(`chrome.tabs.update(${userTab},{active:true})`);
  await c.newTab(`${srv.base}/login-form/`);
  await c.act([{ click: 'text=Sign in' }], { snapshot: 'none' });
  await c.navigate(`${srv.base}/long-form/`);
  assert.equal(await activeTab(), userTab);
});

test('opt-in agent window: agent tabs open in their own unfocused window', async () => {
  const sid = await c.newTab(`${srv.base}/login-form/`, { window: 'agent' });
  const agentWin = await swEval(`chrome.tabs.get(${+c.tabs.get(sid).targetId}).then(t=>t.windowId)`);
  const userWin = await swEval(`chrome.tabs.get(${userTab}).then(t=>t.windowId)`);
  assert.notEqual(agentWin, userWin);
  assert.equal(await activeTab(), userTab);
});

test('window resize: allowed for the agent window, refused for the user window', async () => {
  const sid = await c.newTab(`${srv.base}/login-form/`, { window: 'agent' });
  c.current = sid;
  assert.match(await c.emulate({ width: 700, height: 600, window: true }), /window resized to 700×600/);
  const w = await swEval(`chrome.tabs.get(${+c.tabs.get(sid).targetId}).then(t=>chrome.windows.get(t.windowId)).then(w=>w.width)`);
  assert.equal(w, 700);
  const sid2 = await c.newTab(`${srv.base}/login-form/`); // in the user's window
  c.current = sid2;
  await assert.rejects(c.emulate({ width: 500, height: 500, window: true }), /agent window/);
});

test('a tab the user opens from an agent tab stays invisible; a popup from an agent click is adopted', async () => {
  const sid = await c.newTab(`${srv.base}/new-tab/`);
  const agentTabId = +c.tabs.get(sid).targetId;
  await new Promise((r) => setTimeout(r, 3500)); // no agent input for a while
  await swEval(`chrome.tabs.create({url:${JSON.stringify(srv.base + '/login-form/?user')},openerTabId:${agentTabId},active:false})`);
  await new Promise((r) => setTimeout(r, 500));
  assert.doesNotMatch(await c.listTabs(), /\?user/);
  await c.act([{ click: 'text=Open billing portal' }], { snapshot: 'none' });
  await new Promise((r) => setTimeout(r, 800));
  assert.equal((await c.listTabs()).split('\n').filter((l) => /new-tab|billing|portal/i.test(l)).length >= 2, true);
});

test('session end: untouched agent tabs close, a tab the user used stays (ungrouped)', async () => {
  const kept = await c.newTab(`${srv.base}/login-form/?kept`);
  const gone = await c.newTab(`${srv.base}/login-form/?gone`);
  const keptId = +c.tabs.get(kept).targetId,
    goneId = +c.tabs.get(gone).targetId;
  await swEval(`chrome.tabs.update(${keptId},{active:true})`); // the user looks at it
  await browser.close();
  await new Promise((r) => setTimeout(r, 1500));
  const ids = await swEval('chrome.tabs.query({}).then(ts=>ts.map(t=>t.id))');
  assert.ok(ids.includes(keptId), 'tab the user used is kept');
  assert.ok(!ids.includes(goneId), 'untouched agent tab is closed');
  assert.ok(ids.includes(userTab), 'user tab untouched');
  await connect(); // later tests or teardown need a live session
});
