// Scrubber for session-derived text. Output is for LOCAL analysis only (see .gitignore: local/).
// Strategy: replace identity (hosts, ids, secrets, contact data, names) with stable placeholders;
// keep shape (URL path structure, tool names, error classes) so patterns stay analyzable.
import { createHash } from 'node:crypto';

const PUBLIC_HOSTS = new Set(['github.com', 'www.google.com', 'google.com', 'developer.chrome.com', 'docs.anthropic.com',
  'claude.ai', 'www.npmjs.com', 'stackoverflow.com', 'developer.mozilla.org', 'chromewebstore.google.com', 'www.youtube.com',
  'chatgpt.com', 'platform.openai.com', 'console.anthropic.com', 'vercel.com', 'dash.cloudflare.com', 'app.supabase.com',
  'supabase.com', 'www.figma.com', 'play.google.com', 'apps.apple.com', 'appstoreconnect.apple.com', 'console.firebase.google.com']);
const FILE_EXT = /\.(m?js|cjs|tsx?|jsx|html?|json|md|css|scss|py|txt|png|jpe?g|svg|gif|webp|ya?ml|sh|env|lock|toml|xml|csv|log|pdf|zip|mp[34]|wav|kt|swift|java|gradle|plist|rb|go|rs|c|h|cpp|sql|ini|conf|map|d\.ts)$/i;
const ALLOW_PROPER = /^(Claude|Chrome|Google|GitHub|Codex|Playwright|Safari|Firefox|Edge|Gmail|React|Vue|Node|Supabase|Cloudflare|Vercel|Stripe|RevenueCat|Apple|App Store|Play Store|Figma|Slack|Notion|Jira|Linear|Terms Of Use|Privacy Policy|Sign In|Log In|Dark Mode|Chrome DevTools|Claude Code|MCP)$/i;
// code identifiers that look like hostnames: CDP methods (Runtime.evaluate), JS members (document.body, window.location)
const CODE_IDENT = /^(Runtime|Page|DOM|Input|Network|Target|Emulation|Fetch|Log|Browser|Accessibility|CSS|Debugger|Overlay|Storage|document|window|console|location|navigator|history|Math|JSON|Object|Array|Promise|element|el|this|self|globalThis)\.[A-Za-z]+$/;
const LOCAL = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/;

const h = (s, n = 6) => createHash('sha256').update('bbm-scrub:' + s.toLowerCase()).digest('hex').slice(0, n);

function segment(s) {
  if (/^\d+$/.test(s)) return ':n';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return ':uuid';
  if (/^[0-9a-f]{12,}$/i.test(s)) return ':hex';
  if (/^[A-Za-z0-9_-]{20,}$/.test(s)) return ':id';
  if (/@/.test(s)) return ':email';
  if (s.length > 40) return ':s';
  return s.replace(/\d{3,}/g, 'N');
}

export function scrubUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return '<url>'; }
  if (!/^(https?|wss?|file|chrome|chrome-extension):$/.test(u.protocol)) return `${u.protocol}<redacted>`;
  if (u.protocol === 'file:') return 'file://' + u.pathname.split('/').map((p, i, a) => (i === a.length - 1 && p.includes('.') ? '*' + p.slice(p.lastIndexOf('.')) : p ? '_' : '')).join('/');
  let host = u.host;
  if (!LOCAL.test(host) && !PUBLIC_HOSTS.has(u.hostname)) {
    const tld = u.hostname.includes('.') && !/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) ? '.' + u.hostname.split('.').pop() : '';
    host = `h${h(u.hostname)}${tld}`;
  }
  const path = u.pathname.split('/').map((p) => (p ? segment(decodeURIComponentSafe(p)) : p)).join('/');
  const qs = [...u.searchParams.keys()].map((k) => `${/^(page|q|sort|tab|view|lang|limit|offset|filter|id|type|mode)$/i.test(k) ? k : 'k' + h(k, 4)}=_`);
  return `${u.protocol}//${host}${path}${qs.length ? '?' + qs.join('&') : ''}${u.hash ? '#_' : ''}`;
}

function decodeURIComponentSafe(s) { try { return decodeURIComponent(s); } catch { return s; } }

const RULES = [
  // secrets first (they may contain url-ish chars)
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '<private-key>'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '<jwt>'],
  [/\b(sk-ant-[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|sbp_[0-9a-f]{20,}|ops_[A-Za-z0-9]{20,})\b/g, '<secret>'],
  [/\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{12,}/gi, '$1 <secret>'],
  [/((?:pass(?:word)?|passwd|pwd|secret|token|api[_-]?key|apikey|auth|cookie|session)["']?\s*[:=]\s*["']?)[^\s"',;&]{4,}/gi, '$1<redacted>'],
  // URLs (before emails/hosts so they keep shape)
  [/\b(?:https?|wss?|file|chrome-extension):\/\/[^\s"'<>)\]}`\\]+/g, (m) => scrubUrl(m.replace(/[.,;:]+$/, ''))],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>'],
  // postal addresses: "5120 N 56th Street Milwaukee, WI 53218", "#3161A", ZIP / postal codes
  [/\b\d{1,6}[A-Z]?\s+(?:[NSEW]\.?\s+)?(?:[A-Za-z0-9.'-]+\s+){0,4}(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct|place|pl|square|sq|terrace|ter|parkway|pkwy|highway|hwy|crescent|cres|circle|cir)\b\.?(?:[ ,]+(?:#|apt\.?|unit|suite|ste\.?)\s*[\w-]+)?/gi, '<address>'],
  [/\b\d{1,6}\s+(?:rue|chemin|avenue|av\.?|boulevard|boul\.?|calle|via|place|allée|route)\s+(?:[A-Za-zÀ-ÿ'.-]+\s?){1,3}(?:ouest|est|nord|sud|[NSEW]\b)?/gi, '<address>'],
  [/(?:#|\b(?:apt|unit|suite|ste)\.?\s*)\d+[A-Z]?\b/gi, '<unit>'],
  [/\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/g, '<state-zip>'],
  [/\b[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\s?\d[ABCEGHJ-NPRSTV-Z]\d\b/g, '<postal>'],
  [/\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/g, '<postal>'],
  [/\b(?:\d[ -]?){13,19}\b/g, (m) => (luhn(m.replace(/\D/g, '')) ? '<card>' : m)],
  // phones need a separator or a + prefix (bare 10-digit runs are usually ids, e.g. Chrome tab ids)
  [/(?:\+\d{1,3}[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}|\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4})\b/g, '<phone>'],
  [/\b(?!127\.0\.0\.1\b)(?!0\.0\.0\.0\b)(?:\d{1,3}\.){3}\d{1,3}\b/g, '<ip>'],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>'],
  [/\b[0-9a-f]{32,}\b/gi, '<hex>'],
  [/\b[A-Za-z0-9+/_-]{40,}={0,2}/g, '<blob>'],
  // bare hostnames in prose (foo.bar.com) that are not public
  [/\b(?:[a-z0-9-]+\.)+[a-z]{2,10}\b/gi, (m) => (PUBLIC_HOSTS.has(m.toLowerCase()) || FILE_EXT.test(m) || /^\d/.test(m) || CODE_IDENT.test(m) ? m : `h${h(m)}.${m.split('.').pop()}`)],
  // home paths
  [/\/Users\/[^/\s"']+/g, '/Users/<user>'],
];

function luhn(d) {
  let s = 0, alt = false;
  for (let i = d.length - 1; i >= 0; i--) { let n = +d[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } s += n; alt = !alt; }
  return s % 10 === 0;
}

/** Scrub free text. names: extra literal names to remove. prose: also remove proper-noun runs and long numbers (user intents). */
export function scrub(text, { names = [], maxLen = 4000, prose = false } = {}) {
  if (text == null) return text;
  let s = String(text);
  if (s.length > maxLen) s = s.slice(0, maxLen) + '…';
  for (const [re, rep] of RULES) s = s.replace(re, rep);
  if (prose) {
    // runs of 2+ Capitalized words (companies, people, places), except a small allowlist of product terms
    s = s.replace(/\b[A-ZА-ЯЁ][a-zа-яё'’-]+(?:\s+(?:of|de|la|du|von|van|&)?\s*[A-ZА-ЯЁ][a-zа-яё'’-]+)+\b/g, (m) => (ALLOW_PROPER.test(m) ? m : '<proper>'));
    s = s.replace(/\b\d{4,}\b/g, '<n>');
  }
  for (const n of names) if (n && n.length >= 3) s = s.replace(new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '<name>');
  return s;
}
