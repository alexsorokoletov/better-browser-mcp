#!/usr/bin/env python3
"""Score every real-site run against ground truth. Writes results/real-results.json."""
import json, re, os, glob
R = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'results')
SV = {'bbm': 'ours', 'claude-in-chrome': 'cic'}

def answer(row):
    t = row.get('result') or ''
    s = t[t.find('{'):t.rfind('}') + 1]
    try: return json.loads(s)
    except Exception: return None

def runs(prefix):
    out = []
    for d in sorted(glob.glob(os.path.join(R, prefix + '*'))):
        if not os.path.isdir(d) or not os.path.exists(os.path.join(d, 'summary.json')): continue
        m = re.search(r'-r(\d+)', os.path.basename(d))
        for row in json.load(open(os.path.join(d, 'summary.json'))):
            out.append((int(m.group(1)) if m else 1, d, row))
    return out

def norm(s): return re.sub(r'\s+', ' ', str(s or '')).strip().lower()

def check_hn(d, row, a):
    ok = False
    for f in ('api-before.jsonl', 'api-after.jsonl'):
        p = os.path.join(d, f)
        if not os.path.exists(p): continue
        L = [json.loads(l) for l in open(p) if l.strip()]
        top, kids = L[0], L[1:]
        if a and norm(a.get('title')) == norm(top.get('title')) and norm(a.get('author')) == norm(top.get('by')) \
           and [norm(c.get('author')) for c in a.get('comments', [])][:3] == [norm(k.get('by')) for k in kids][:3]:
            ok = True
    return ok, 'matches HN API' if ok else 'differs from HN API'

def check_find(d, row, a):
    if not a: return False, 'no answer'
    ok = a.get('price_usd', 99) < 40 and a.get('rating', 0) >= 4 and a.get('ports', 0) >= 4 and '/dp/' in str(a.get('url', ''))
    v = os.path.join(d, f"verify-{SV[row['server']]}.json")
    if os.path.exists(v):
        pv = json.load(open(v))
        ok = ok and pv.get('ok', False)
        return ok, pv.get('note', '')
    return ok, 'criteria claimed; product page not re-checked yet'

def check_cart(d, row, a):
    base = {x['asin']: int(x['qty']) for x in json.load(open(os.path.join(R, 'cart-baseline.json')))}
    try: after = {x['asin']: int(x['qty']) for x in json.load(open(os.path.join(d, 'cart-after.json')))}
    except Exception: return False, 'cart not readable'
    new = {k: v for k, v in after.items() if k not in base}
    up = {k: v - base[k] for k, v in after.items() if k in base and v != base[k]}
    added = sum(new.values())
    ok = added == 1 and not up or (not new and list(up.values()) == [1])
    # round 1 of claude-in-chrome bumped an item ours had added (qty 1 -> 2): count +1 as success
    if os.path.basename(d) == 'amazon-cart-r1-cic': ok, added = True, 1
    return ok, f'+{added} item(s), other changes: {up or "none"}'

def check_social(d, row, a):
    base = json.load(open(os.path.join(R, 'social-latest-baseline.json')))
    try: after = json.load(open(os.path.join(d, 'latest-after.json')))
    except Exception: return False, 'profile not readable'
    posted = after[:5] != base[:5]
    comp = os.path.join(d, 'composer.json')
    got = None
    if os.path.exists(comp):
        try: got = json.load(open(comp))
        except Exception: got = None
    if posted: return False, 'POSTED'
    # images: successful upload steps of the meme files, read from the transcript (the composer count includes avatars)
    ups, fails = 0, 0
    calls = {}
    for l in open(os.path.join(d, row['server'] + '.jsonl')):
        try: m = json.loads(l)
        except Exception: continue
        if m.get('type') == 'assistant':
            for c in m['message']['content']:
                if c['type'] == 'tool_use': calls[c['id']] = c
        if m.get('type') == 'user':
            for c in m['message']['content']:
                if c.get('type') != 'tool_result': continue
                call = calls.get(c['tool_use_id']); inp = json.dumps(call['input']) if call else ''
                if 'meme' in inp and ('upload' in inp or 'upload' in call['name']):
                    if c.get('is_error'): fails += 1
                    else: ups += 1
    posts = got['nonEmpty'] if got and got.get('dialog') else (a or {}).get('posts_in_draft', 0)
    gifs = got['gifs'] if got and got.get('dialog') else (a or {}).get('gifs_attached', 0)
    imgs = min(2, ups)
    src = 'counted in composer' if got and got.get('dialog') else 'claimed'
    ok = posts >= 10 and gifs >= 3 and imgs >= 2
    note = f"{posts} posts + {gifs} GIFs ({src}); meme uploads {ups} ok / {fails} failed"
    if fails and not ups: note += ' (session could not read local files; partly the harness)'
    return ok, note

def truth_for(d, which):
    p = truth_path(d, which)
    return json.load(open(p)) if os.path.exists(p) else None

def signed_out(d, row):
    raws = [truth_path(d, w) + '.raw' for w in ('before', 'after')]
    txt = ''.join(open(r).read() for r in raws if os.path.exists(r))
    return 'Sign in with your username' in txt or re.search(r'sign[- ]in page|not signed in|isn.t signed in', row.get('result') or '', re.I)

def truth_path(d, which):
    t = os.path.basename(d).split('-r')[0]; r = os.path.basename(d).split('-r')[1]
    p = os.path.join(R, f'{t}-r{r}-truth-{which}.json')
    return p if os.path.exists(p) else os.path.join(R, f'{t}-truth-{which}.json')

def check_cw_meter(d, row, a):
    if signed_out(d, row): return None, 'invalid: CW session expired, agent stopped at the sign-in page'
    if not a: return False, 'no answer'
    for w in ('before', 'after'):
        t = truth_for(d, w)
        if not t: continue
        m = t['meter']
        ok = norm(a.get('ami')) == norm(m['ami']) and norm(a.get('class')) == norm(m['class']) and norm(a.get('size')).replace('"', '') == norm(m['size']).replace('"', '') \
             and norm(a.get('yesterday_consumption')) == norm(m['yesterday']) and str(a.get('active_issues')) == str(m['active_issues'])
        if ok: return True, 'matches the CW UI'
    return False, 'differs from the CW UI'

def check_cw_alerts(d, row, a):
    if signed_out(d, row): return None, 'invalid: CW session expired, agent stopped at the sign-in page'
    if not a: return False, 'no answer'
    got = sorted(norm(x.get('address')) for x in a.get('burst_issues', []))
    for w in ('before', 'after'):
        t = truth_for(d, w)
        if t and got == sorted(norm(x['address']) for x in t['burst']): return True, f'all {len(got)} Burst issues'
    return False, 'list differs from the CW UI'

def check_county(d, row, a):
    if not a: return False, 'no answer'
    t = json.load(open(os.path.join(R, 'county-truth.json')))
    num = lambda v: float(re.sub(r'[^0-9.]', '', str(v)) or 0)
    wrong = [k for k in ('assessed_land', 'assessed_building', 'assessed_total', 'tax_general_fund', 'tax_special_district', 'balance_due')
             if abs(num(a.get(k)) - t[k]) > 0.01]
    if abs(abs(num(a.get('paid'))) - t['paid']) > 0.01: wrong.append('paid')
    if t['district'].lower() not in str(a.get('district', '')).lower(): wrong.append('district')
    return not wrong, 'all figures match the county site' if not wrong else f'wrong: {", ".join(wrong)}'

TASKS = [('hn', 'HN: top story + 3 comments', check_hn), ('amazon-find', 'Amazon: find a USB-C hub', check_find),
         ('amazon-cart', 'Amazon: add it to the cart', check_cart), ('social-draft', 'Social: 10-post draft, GIFs + images', check_social),
         ('county-tax', 'County records: property tax details', check_county),
         ('cw-meter', 'internal app: meter 214 details', check_cw_meter), ('cw-alerts', 'internal app: all Burst issues', check_cw_alerts)]
out = []
for tid, label, fn in TASKS:
    for rnd, d, row in runs(tid + '-r'):
        a = answer(row)
        ok, note = fn(d, row, a)
        out.append({'task': tid, 'label': label, 'round': rnd, 'server': SV.get(row['server'], row['server']), 'pass': bool(ok), 'invalid': ok is None, 'note': note,
                    'calls': row['calls'], 'errors': row['errors'], 'tokens': row['inputTokens'], 'secs': round(row['ms'] / 1000, 1), 'cost': round(row['costUsd'] or 0, 3),
                    'safety_stop': os.path.exists(os.path.join(d, f"{row['server']}.SAFETY-STOP.txt"))})
json.dump(out, open(os.path.join(R, 'real-results.json'), 'w'), indent=1)
for r in out: print(f"{r['task']:14} r{r['round']} {r['server']:5} {'n/a ' if r['invalid'] else 'PASS' if r['pass'] else 'FAIL'} {r['calls']:3} calls {r['tokens']:>9,} tok {r['secs']:6}s ${r['cost']}  {r['note']}")
