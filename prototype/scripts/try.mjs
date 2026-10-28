// Dev helper: run controller calls from a JSON list. Usage:
//   node scripts/try.mjs '[["navigate","http://127.0.0.1:4777/login-form/"],["snapshot",{}]]'
import { launchChromium } from '../src/cdp/browser.ts';
import { Controller } from '../src/controller.ts';

const calls = JSON.parse(process.argv[2]);
const browser = await launchChromium({ headless: process.env.BBM_HEADLESS !== '0' });
const c = new Controller(browser);
await c.init();
try {
  for (const [fn, ...args] of calls) {
    const t0 = Date.now();
    let out;
    try {
      if (fn === 'act') out = (await c.act(args[0], args[1] || {})).text;
      else if (fn === 'screenshot') {
        const s = await c.screenshot(args[0] || {});
        out = `image ${s.width}x${s.height} ${s.data.length}b64`;
      } else out = await c[fn](...args);
    } catch (e) {
      out = 'ERROR ' + e.stack;
    }
    console.log(`=== ${fn} ${JSON.stringify(args).slice(0, 120)} (${Date.now() - t0}ms, ${String(out).length} chars)\n${out}`);
  }
} finally {
  await browser.close();
}
