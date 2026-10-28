// Line diff for snapshot deltas (Myers O(ND)), rendered as compact hunks.

const CONTEXT = 1;
const MAX_D = 3000;

type Op = [' ' | '-' | '+', string];

/** Returns ops: array of [' '|'-'|'+', line]. Falls back to a multiset diff for huge edit distances. */
function myers(a: string[], b: string[]): Op[] | null {
  const n = a.length,
    m = b.length,
    max = Math.min(n + m, MAX_D);
  const v = new Int32Array(2 * max + 2);
  const trace: Int32Array[] = [];
  const off = max + 1;
  for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[off + k] = x;
      if (x >= n && y >= m) return backtrack(trace, a, b, off);
    }
  }
  return null;
}

function backtrack(trace: Int32Array[], a: string[], b: string[], off: number): Op[] {
  const ops: Op[] = [];
  let x = a.length,
    y = b.length;
  for (let d = trace.length - 1; d >= 0; d--) {
    const v = trace[d];
    const k = x - y;
    const prevK = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? k + 1 : k - 1;
    const px = v[off + prevK],
      py = px - prevK;
    while (x > px && y > py) {
      ops.push([' ', a[--x]]);
      y--;
    }
    if (d > 0) {
      if (x === px) ops.push(['+', b[--y]]);
      else ops.push(['-', a[--x]]);
    }
  }
  return ops.reverse();
}

function multiset(a: string[], b: string[]): Op[] {
  const count = new Map<string, number>();
  for (const l of b) count.set(l, (count.get(l) || 0) + 1);
  const ops: Op[] = [];
  for (const l of a) {
    const c = count.get(l);
    if (c) count.set(l, c - 1);
    else ops.push(['-', l]);
  }
  const ca = new Map<string, number>();
  for (const l of a) ca.set(l, (ca.get(l) || 0) + 1);
  for (const l of b) {
    const c = ca.get(l);
    if (c) ca.set(l, c - 1);
    else ops.push(['+', l]);
  }
  return ops;
}

export function diffLines(prev: string[], next: string[]) {
  const ops = myers(prev, next) || multiset(prev, next);
  let added = 0,
    removed = 0;
  for (const [t] of ops) {
    if (t === '+') added++;
    else if (t === '-') removed++;
  }
  if (!added && !removed) return { changed: false, added, removed, text: '' };
  // keep changed lines + CONTEXT lines around them
  const keep = new Uint8Array(ops.length);
  ops.forEach(([t], i) => {
    if (t === ' ') return;
    for (let j = Math.max(0, i - CONTEXT); j <= Math.min(ops.length - 1, i + CONTEXT); j++) keep[j] = 1;
  });
  const out: string[] = [];
  let gap = false;
  ops.forEach(([t, l], i) => {
    if (!keep[i]) {
      gap = true;
      return;
    }
    if (gap && out.length) out.push('…');
    gap = false;
    out.push(`${t} ${l}`);
  });
  return { changed: true, added, removed, text: out.join('\n') };
}
