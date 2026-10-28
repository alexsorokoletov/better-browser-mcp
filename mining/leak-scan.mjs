// Second-line defence: scan mined output for anything that still looks sensitive. Prints counts + samples (local).
import { readFileSync } from 'node:fs';
const PATTERNS = {
  email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  url_host: /https?:\/\/(?!h[0-9a-f]{6}\b|localhost|127\.0\.0\.1|github\.com|www\.google\.com|claude\.ai)[a-z0-9.-]+\.[a-z]{2,}/gi,
  long_digits: /\b\d{5,}\b/g,
  secretish: /\b(sk-|gh[pousr]_|xox|AKIA|eyJ)[A-Za-z0-9_-]{6,}/g,
  address: /\b\d{2,6}\s+[A-Z][a-z]+\s+(Street|St|Ave|Avenue|Road|Rd|Blvd|Drive)\b/g,
  capitalized_pair: /\b[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}\b/g,
};
for (const f of process.argv.slice(2)) {
  const s = readFileSync(f, 'utf8');
  for (const [k, re] of Object.entries(PATTERNS)) {
    const m = s.match(re) || [];
    const uniq = [...new Set(m)];
    if (uniq.length) console.log(`${f.split('/').slice(-2).join('/')} ${k}: ${m.length} (${uniq.length} unique) e.g. ${uniq.slice(0, 6).map((x) => JSON.stringify(x)).join(' ')}`);
  }
}
