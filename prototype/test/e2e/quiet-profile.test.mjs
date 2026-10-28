// A Chromium that bbm launches never offers to save addresses, cards or passwords (the bubbles pop over the
// user's screen while agents or tests fill forms such as the long-form fixture).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchChromium } from '../../src/cdp/browser.ts';

test('the launched profile has autofill and password saving off, and Chromium keeps them', async () => {
  const browser = await launchChromium({});
  try {
    await browser.createTab('about:blank'); // Chromium is up and has loaded the profile
    const dir = browser.process.spawnargs.find((a) => a.startsWith('--user-data-dir=')).slice('--user-data-dir='.length);
    const prefs = JSON.parse(readFileSync(join(dir, 'Default', 'Preferences'), 'utf8'));
    assert.equal(prefs.autofill?.profile_enabled, false);
    assert.equal(prefs.autofill?.credit_card_enabled, false);
    assert.equal(prefs.credentials_enable_service, false);
    assert.equal(prefs.profile?.password_manager_enabled, false);
  } finally {
    await browser.close();
  }
});
