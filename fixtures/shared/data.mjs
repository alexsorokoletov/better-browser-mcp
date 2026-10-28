// Deterministic data shared by the browser pages and bench/check.mjs.
// Pure ESM, no Node or DOM APIs, so it runs in both places.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ['Ava', 'Ben', 'Chloe', 'Dmitri', 'Elena', 'Farah', 'Gus', 'Hana', 'Ivan', 'Jun', 'Kofi', 'Lena', 'Mateo', 'Nora', 'Omar', 'Priya', 'Quinn', 'Rosa', 'Sven', 'Tara', 'Uma', 'Vik', 'Wren', 'Yara', 'Zane'];
const LAST = ['Adams', 'Baker', 'Costa', 'Dubois', 'Eriksen', 'Fischer', 'Garcia', 'Haddad', 'Ito', 'Jensen', 'Kowalski', 'Lopez', 'Moreau', 'Novak', 'Okafor', 'Petrov', 'Rossi', 'Silva', 'Tanaka', 'Weber'];
const CITIES = ['Lisbon', 'Berlin', 'Austin', 'Osaka', 'Lagos', 'Toronto', 'Krakow', 'Seoul', 'Lyon', 'Denver', 'Porto', 'Malmo'];
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function pick(rand, arr) {
  return arr[Math.floor(rand() * arr.length)];
}

let virtualCache;
/** 5000 rows for the virtual-list task. SKUs are unique. */
export function virtualRows() {
  if (virtualCache) return virtualCache;
  const rand = mulberry32(5000);
  const seen = new Set();
  const rows = [];
  for (let i = 0; i < 5000; i++) {
    let sku;
    do {
      sku = `${pick(rand, LETTERS)}${pick(rand, LETTERS)}${pick(rand, LETTERS)}-${String(Math.floor(rand() * 10000)).padStart(4, '0')}`;
    } while (seen.has(sku));
    seen.add(sku);
    rows.push({ index: i, sku, name: `${pick(rand, FIRST)} ${pick(rand, LAST)}`, city: pick(rand, CITIES) });
  }
  virtualCache = rows;
  return rows;
}
export const VIRTUAL_TARGET_INDEX = 3817;

export const REGIONS = ['North', 'South', 'East', 'West', 'Central'];
export const CATEGORIES = ['Hardware', 'Software', 'Services', 'Training'];
export const STATUSES = ['Paid', 'Pending', 'Refunded'];

let tableCache;
/** 500 orders for the data-extraction task. amountCents is an integer. */
export function tableRows() {
  if (tableCache) return tableCache;
  const rand = mulberry32(500);
  const rows = [];
  const start = Date.UTC(2026, 0, 1);
  for (let i = 0; i < 500; i++) {
    const day = Math.floor(rand() * 270);
    rows.push({
      id: `ORD-${String(10001 + i)}`,
      customer: `${pick(rand, FIRST)} ${pick(rand, LAST)}`,
      region: pick(rand, REGIONS),
      category: pick(rand, CATEGORIES),
      status: pick(rand, STATUSES),
      amountCents: 500 + Math.floor(rand() * 250000),
      date: new Date(start + day * 86400000).toISOString().slice(0, 10),
    });
  }
  tableCache = rows;
  return rows;
}

export const TABLE_QUESTION = { region: 'West', status: 'Refunded' };

export function tableAnswer() {
  const rows = tableRows().filter((r) => r.region === TABLE_QUESTION.region && r.status === TABLE_QUESTION.status);
  const cents = rows.reduce((s, r) => s + r.amountCents, 0);
  return { count: rows.length, totalCents: cents, total: (cents / 100).toFixed(2) };
}

export function formatMoney(cents) {
  return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const TIMEZONES = [
  'Africa/Cairo', 'Africa/Lagos', 'Africa/Nairobi', 'America/Anchorage', 'America/Bogota', 'America/Chicago',
  'America/Denver', 'America/Halifax', 'America/Lima', 'America/Los_Angeles', 'America/Mexico_City',
  'America/New_York', 'America/Sao_Paulo', 'America/Toronto', 'Asia/Bangkok', 'Asia/Dubai', 'Asia/Hong_Kong',
  'Asia/Jakarta', 'Asia/Kolkata', 'Asia/Seoul', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Tokyo',
  'Australia/Perth', 'Australia/Sydney', 'Europe/Amsterdam', 'Europe/Athens', 'Europe/Berlin', 'Europe/Dublin',
  'Europe/Helsinki', 'Europe/Istanbul', 'Europe/Lisbon', 'Europe/London', 'Europe/Madrid', 'Europe/Paris',
  'Europe/Prague', 'Europe/Rome', 'Europe/Stockholm', 'Europe/Warsaw', 'Pacific/Auckland', 'Pacific/Honolulu',
];
