#!/bin/sh
# Re-check each amazon-find answer on its live product page (price < 40, rating >= 4); ports come from the title/bullets.
cd "$(dirname "$0")"
for d in results/amazon-find-r*; do
  for s in bbm:ours claude-in-chrome:cic; do
    srv=${s%%:*}; short=${s##*:}; [ -f "$d/verify-$short.json" ] && continue
    # The URL comes from model output: accept only an Amazon product page, and JSON-encode the call list.
    calls=$(python3 - "$d/summary.json" "$srv" <<'PY'
import json, re, sys
rows = [x for x in json.load(open(sys.argv[1])) if x['server'] == sys.argv[2]]
r = rows[0]['result'] if rows else ''
url = json.loads(r[r.find('{'):r.rfind('}') + 1]).get('url', '') if '{' in r else ''
if not re.fullmatch(r'https://www\.amazon\.[a-z.]{2,6}/(?:[^\s?#]*/)?dp/[A-Z0-9]{10}[^\s]*', url): sys.exit(1)
expr = "JSON.stringify({price:(document.querySelector('.priceToPay .a-offscreen,#corePrice_feature_div .a-offscreen')||{}).innerText,rating:document.querySelector('#acrPopover')?.getAttribute('title'),text:(document.getElementById('productTitle')?.innerText||'')+' '+[...document.querySelectorAll('#feature-bullets li')].map(l=>l.innerText).join(' ')})"
print(json.dumps([["navigate", {"url": url}], ["eval", {"expression": expr}]]))
PY
) || { echo '{"ok":false,"note":"answer URL is not an Amazon product page"}' > "$d/verify-$short.json"; continue; }
    timeout 120 node bbm-client.mjs "$calls" 2>/dev/null | sed -n '/### eval/{n;p;}' | python3 -c "
import json,sys,re
p=json.load(sys.stdin); pr=float(re.sub('[^0-9.]','',p.get('price') or '99') or 99); rt=float((p.get('rating') or '0').split()[0])
ports=max([int(x) for x in re.findall(r'(\d+)[- ](?:in[- ]1|ports?)',p.get('text',''),re.I)]+[0])
ok=pr<40 and rt>=4 and ports>=4
json.dump({'ok':ok,'note':f'product page re-checked: \${pr}, {rt} stars, {ports} ports'},open('$d/verify-$short.json','w'))"
  done
done
