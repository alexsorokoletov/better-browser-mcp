// Remove cart items that are not in results/cart-baseline.json (quantity changes on baseline items are reported, not touched).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './mcp-client.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const base = new Set(JSON.parse(readFileSync(join(HERE, 'results/cart-baseline.json'), 'utf8')).map((x) => x.asin));
const mcp = await connect();
const call = mcp.text;
await call('tabs', { action: 'new', url: 'https://www.amazon.com/gp/cart/view.html' });
const removed = [];
for (let round = 0; round < 5; round++) {
  const items = JSON.parse(await call('eval', { expression: 'JSON.stringify([...document.querySelectorAll(".sc-list-item[data-asin][data-itemtype=active]")].map(e=>({asin:e.dataset.asin,title:(e.querySelector(".sc-product-title, .a-truncate-full")||{}).innerText?.trim().slice(0,40)})))' }).then((t) => t.split('\n')[0]));
  const extra = items.filter((x) => x.asin && !base.has(x.asin));
  if (!extra.length) break;
  const snap = await call('snapshot', { search: 'Delete ' + extra[0].title.slice(0, 25) });
  const m = snap.match(/button "Delete [^\n]*\[(f?\d*e\d+)\]/);
  if (!m) { console.log('no delete button for', extra[0].asin); break; }
  await call('act', { steps: [{ press: 'Enter', ref: m[1] }], snapshot: 'none' });
  removed.push(extra[0].asin);
  await call('navigate', { url: 'https://www.amazon.com/gp/cart/view.html' });
}
await call('tabs', { action: 'close' });
console.log(JSON.stringify({ removed }));
mcp.close();
