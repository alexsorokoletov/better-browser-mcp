import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Controller } from '../../src/controller.ts';

function controller(send) {
  return new Controller(
    {
      mode: 'extension',
      conn: { send },
      onTabCreated() {},
      onTabChanged() {},
      onTabDestroyed() {},
      listTabs: () => [],
    },
    { project: '/work/better-browser-mcp' },
  );
}

test('an old relay gives update instructions without asking for an unsupported label', async () => {
  const c = controller(async (method) => {
    if (method === 'Bbm.setLabel') throw new Error('Bbm.setLabel: Bbm.setLabel is not supported by the extension relay');
    return {};
  });
  await c.init();
  const notice = c.takeNotice();
  assert.match(notice, /extension is outdated/);
  assert.match(notice, /npm run build:extension/);
  assert.match(notice, /chrome:\/\/extensions/);
  assert.doesNotMatch(notice, /your tab group is|tabs action=label/);
  assert.equal(c.takeNotice(), '');
  await assert.rejects(c.setLabel('TEST'), /extension is outdated/);
  assert.equal(c.label, '');
});

test('a failed label change preserves the last successful label, notice and reconnect state', async () => {
  let failure;
  const c = controller(async () => {
    if (failure) throw failure;
    return {};
  });
  const saved = [];
  c.onLabel = (label) => saved.push(label);
  await c.init();
  assert.match(c.takeNotice(), /your tab group is Agent:BBM1/);
  assert.equal(await c.setLabel('GOOD'), 'tab group: Agent:GOOD');
  c.notice = 'pending notice';
  failure = new Error('connection closed');
  await assert.rejects(c.setLabel('NEXT'), (e) => e === failure);
  assert.equal(c.label, 'GOOD');
  assert.equal(c.takeNotice(), 'pending notice');
  assert.deepEqual(saved, ['GOOD']);
  failure = undefined;
  assert.equal(await c.setLabel(''), 'tab group: Agent:BBM1');
  assert.deepEqual(saved, ['GOOD', '']);
});

test('a startup transport failure does not claim the group was renamed', async () => {
  const c = controller(async () => {
    throw new Error('connection closed');
  });
  await c.init();
  assert.equal(c.takeNotice(), 'could not name the tab group: connection closed');
});
