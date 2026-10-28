#!/bin/sh
# Print cart items as JSON lines {asin,title,qty} using our MCP in the user's Chrome.
cd "$(dirname "$0")"
timeout 120 node bbm-client.mjs '[["navigate",{"url":"https://www.amazon.com/gp/cart/view.html"}],["eval",{"expression":"JSON.stringify([...document.querySelectorAll(\"[data-asin][data-itemtype=active], .sc-list-item[data-asin]\")].filter(e=>e.dataset.asin).map(e=>({asin:e.dataset.asin,qty:e.dataset.quantity,title:(e.querySelector(\".sc-product-title, .a-truncate-full\")||{}).innerText?.trim().slice(0,80)})))"}]]' 2>/dev/null | sed -n '/### eval/{n;p;}'
