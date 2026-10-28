// Network formatting: cookie redaction, sizes, durations and DevTools-style timing phases.
// Cookie and credential header values are often login sessions or keys: shown as a prefix + length unless BBM_SHOW_COOKIES=1 (a server
// setting on purpose, so a page cannot talk the model into revealing them). Applies to the details view and HAR files.
export const showCookies = () => process.env.BBM_SHOW_COOKIES === '1';
export const redact = (v: string) => (showCookies() || v.length <= 6 ? v : `${v.slice(0, 4)}…(${v.length} chars)`);
// Headers that carry credentials (tokens, keys) are shortened like cookie values.
const CREDENTIAL_HEADER =
  /^(authorization|proxy-authorization|x-api-key|api-key|x-auth-token|x-access-token|x-csrf-token|x-xsrf-token|x-amz-security-token)$|token|secret|api[-_]?key|password/i;
export const redactHeader = (name: string, value: string) => {
  const n = name.toLowerCase();
  if (CREDENTIAL_HEADER.test(n))
    return String(value)
      .split('\n')
      .map((v) => redact(v))
      .join('\n');
  if (n === 'cookie')
    return String(value)
      .split(/;\s*/)
      .map((kv) => {
        const i = kv.indexOf('=');
        return i < 0 ? kv : `${kv.slice(0, i)}=${redact(kv.slice(i + 1))}`;
      })
      .join('; ');
  if (n === 'set-cookie')
    return String(value)
      .split('\n')
      .map((line) => line.replace(/^([^=;]+)=([^;]*)/, (_, k: string, v: string) => `${k}=${redact(v)}`))
      .join('\n');
  return value;
};
export const kb = (n: number | null | undefined) => (n == null ? '' : n < 1024 ? `${n}B` : `${(n / 1024).toFixed(1)}kB`);
export const durMs = (e: { ts: number; end?: number | null }) => (e.end != null ? Math.round((e.end - e.ts) * 1000) : null);
/** DevTools-style phases from response.timing (ms). */
export function phases(t: Record<string, number> | null | undefined) {
  if (!t) return null;
  const d = (a: string, b: string) => (t[a] >= 0 && t[b] >= 0 ? Math.round(t[b] - t[a]) : 0);
  return {
    dns: d('dnsStart', 'dnsEnd'),
    connect: d('connectStart', 'connectEnd'),
    tls: d('sslStart', 'sslEnd'),
    send: d('sendStart', 'sendEnd'),
    wait: d('sendEnd', 'receiveHeadersEnd'),
  };
}
