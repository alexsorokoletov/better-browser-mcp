import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrub, scrubUrl } from '../scrub.mjs';

// Fake tokens, built from pieces so secret scanners do not flag this file.
const ANT = ['sk', 'ant', 'api03', 'AbCdEf1234567890abcdef1234567890ABCDEF'].join('-'); // gitleaks:allow
const GHP = 'gh' + 'p_' + '1234567890abcdefABCDEF1234567890abcd';
const GHO = 'gh' + 'o_' + 'abcdefghijklmnopqrstuvwxyz0123456789';
const SLACK = ['xo' + 'xb', '1234567890', 'abcdefghij'].join('-');
const AWS = 'AK' + 'IA' + 'IOSFODNN7EXAMPLE';
const JWT = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0', 'dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'].join('.');

// Planted corpus: none of these values may survive scrubbing.
const SECRETS = [
  'sam.tester@acme-mobile.example', 'jane.doe+x@gmail.com',
  ANT, GHP,
  GHO, SLACK, AWS,
  JWT,
  'Bearer abc123def456ghi789jkl012mno345', '4111 1111 1111 1111', '+1 (514) 555-0199',
  'supersecretpw!', 'acme-shop.example-client.com', '10.20.30.40', 'Testerovich',
  '3f2504e0-4f89-11d3-9a0c-0305e82c3301', 'a94a8fe5ccb19ba61c4c0873d391e987982fbbd3',
];
const TEXT = `Login as sam.tester@acme-mobile.example with password: supersecretpw! then open
https://acme-shop.example-client.com/stores/3f2504e0-4f89-11d3-9a0c-0305e82c3301/orders/88231?token=a94a8fe5ccb19ba61c4c0873d391e987982fbbd3&page=2
key ${ANT} and ${GHP} ${GHO}
slack ${SLACK} aws ${AWS} jwt ${JWT}
Authorization: Bearer abc123def456ghi789jkl012mno345 card 4111 1111 1111 1111 call +1 (514) 555-0199
server 10.20.30.40 user Testerovich mail jane.doe+x@gmail.com host acme-shop.example-client.com`;

test('planted secrets never survive', () => {
  const out = scrub(TEXT, { names: ['Testerovich'] });
  for (const s of SECRETS) assert.ok(!out.includes(s), `leaked: ${s}\n${out}`);
});

test('urls keep shape, lose identity', () => {
  const u = scrubUrl('https://acme-shop.example-client.com/stores/3f2504e0-4f89-11d3-9a0c-0305e82c3301/orders/88231?token=abc&page=2');
  assert.match(u, /^https:\/\/h[0-9a-f]{6}\.com\/stores\/:uuid\/orders\/:n\?k[0-9a-f]{4}=_&page=_$/);
  assert.equal(scrubUrl('http://localhost:8080/app/x'), 'http://localhost:8080/app/x');
  assert.equal(scrubUrl('http://127.0.0.1:4777/login-form/'), 'http://127.0.0.1:4777/login-form/');
});

test('same host -> same hash (joinable), different hosts differ', () => {
  const a = scrubUrl('https://foo.example.com/a'), b = scrubUrl('https://foo.example.com/b'), c = scrubUrl('https://bar.example.com/a');
  assert.equal(a.split('/')[2], b.split('/')[2]);
  assert.notEqual(a.split('/')[2], c.split('/')[2]);
});

test('well-known public hosts stay readable', () => {
  assert.match(scrubUrl('https://github.com/x/y/pull/12'), /^https:\/\/github\.com\//);
  assert.match(scrubUrl('https://www.google.com/search?q=secret+stuff'), /^https:\/\/www\.google\.com\/search\?q=_$/);
});

test('postal addresses and codes are removed', () => {
  const t = 'properties: Loc. 1: 5120 N 56th Street Milwaukee, WI 53218; 3161 North 76th STREET #3161A, Milwaukee; 12 St James\'s Square SW1Y 4JH; 1000 rue Sherbrooke Ouest, Montréal H3A 3G4';
  const out = scrub(t);
  for (const s of ['5120', '56th', '53218', '3161', '76th', 'SW1Y', 'H3A 3G4', 'Sherbrooke']) assert.ok(!out.includes(s), `leaked ${s}: ${out}`);
});

test('prose mode removes names, companies, ids; keeps product terms', () => {
  const out = scrub('the north pair was done with Paramount Insurance Advisors and John Smith; loan 5864; check controltower.drmtm.us in Claude Code', { prose: true });
  for (const x of ['Paramount', 'John Smith', '5864', 'drmtm']) assert.ok(!out.includes(x), `leaked ${x}: ${out}`);
  assert.match(out, /Claude Code/);
  assert.match(scrub('see index.html and app.js'), /index\.html and app\.js/);
});

test('ids and code identifiers are not mistaken for phones/hosts', () => {
  const out = scrub('Tab 1949882005 timed out on Runtime.evaluate and document.body; call +1 514-555-0199');
  assert.match(out, /Tab 1949882005/);
  assert.match(out, /Runtime\.evaluate and document\.body/);
  assert.match(out, /call <phone>/);
});
