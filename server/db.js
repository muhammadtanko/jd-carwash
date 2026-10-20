import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from './auth.js';

const here = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || resolve(here, '../data/jdcarwash.db');
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

export const CAR_SIZES = ['Small', 'Medium', 'Large'];
export const SERVICES = ['Basic', 'Standard', 'Premium', 'Luxury VIP', 'Super Deluxe', 'Executive'];

db.exec(`
CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  address TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','manager','sales')),
  location_id INTEGER REFERENCES locations(id),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS prices (
  service_id INTEGER NOT NULL REFERENCES services(id),
  car_size TEXT NOT NULL CHECK (car_size IN ('Small','Medium','Large')),
  amount REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (service_id, car_size)
);

CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY,
  plate TEXT NOT NULL UNIQUE,
  customer_name TEXT,
  car_type TEXT NOT NULL,
  car_size TEXT NOT NULL CHECK (car_size IN ('Small','Medium','Large')),
  color TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT,
  first_location_id INTEGER REFERENCES locations(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS packages (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  service_id INTEGER NOT NULL REFERENCES services(id),
  washes INTEGER NOT NULL CHECK (washes > 0),
  discount_pct REAL NOT NULL DEFAULT 0 CHECK (discount_pct BETWEEN 0 AND 100),
  validity_days INTEGER NOT NULL CHECK (validity_days > 0),
  price_small REAL NOT NULL DEFAULT 0,
  price_medium REAL NOT NULL DEFAULT 0,
  price_large REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY,
  serial TEXT NOT NULL UNIQUE,
  seq INTEGER NOT NULL,
  location_id INTEGER REFERENCES locations(id),
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','sold','void')),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS memberships (
  id INTEGER PRIMARY KEY,
  card_id INTEGER NOT NULL UNIQUE REFERENCES cards(id),
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  package_id INTEGER NOT NULL REFERENCES packages(id),
  service_id INTEGER NOT NULL REFERENCES services(id),
  location_id INTEGER NOT NULL REFERENCES locations(id),
  sold_by INTEGER NOT NULL REFERENCES users(id),
  recorded_by INTEGER NOT NULL REFERENCES users(id),
  customer_status TEXT NOT NULL CHECK (customer_status IN ('new','existing')),
  amount_paid REAL NOT NULL,
  washes_total INTEGER NOT NULL,
  washes_used INTEGER NOT NULL DEFAULT 0,
  discount_pct REAL NOT NULL,
  start_date TEXT NOT NULL,
  expiry_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  location_id INTEGER NOT NULL REFERENCES locations(id),
  service_id INTEGER NOT NULL REFERENCES services(id),
  car_size TEXT NOT NULL,
  customer_status TEXT NOT NULL CHECK (customer_status IN ('new','existing')),
  list_price REAL NOT NULL,
  discount REAL NOT NULL DEFAULT 0,
  amount_paid REAL NOT NULL,
  membership_id INTEGER REFERENCES memberships(id),
  used_membership_wash INTEGER NOT NULL DEFAULT 0,
  recorded_by INTEGER NOT NULL REFERENCES users(id),
  visit_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS visits_date ON visits(visit_date, location_id);

CREATE TABLE IF NOT EXISTS inventory_items (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  unit TEXT NOT NULL DEFAULT 'units',
  reorder_level REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS inventory_entries (
  id INTEGER PRIMARY KEY,
  location_id INTEGER NOT NULL REFERENCES locations(id),
  item_id INTEGER NOT NULL REFERENCES inventory_items(id),
  entry_date TEXT NOT NULL,
  opening REAL NOT NULL,
  received REAL NOT NULL DEFAULT 0,
  used REAL NOT NULL DEFAULT 0,
  closing REAL NOT NULL,
  note TEXT,
  recorded_by INTEGER NOT NULL REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (location_id, item_id, entry_date)
);
`);

// ---------- seed (first run only) ----------
const seeded = db.prepare('SELECT COUNT(*) AS n FROM services').get().n > 0;
if (!seeded) {
  db.exec('BEGIN');
  const insService = db.prepare('INSERT INTO services (name, sort) VALUES (?, ?)');
  const insPrice = db.prepare('INSERT INTO prices (service_id, car_size, amount) VALUES (?, ?, ?)');
  // Placeholder prices — the owner changes these under Settings → Prices.
  const base = [3000, 5000, 8000, 12000, 18000, 25000];
  const sizeFactor = { Small: 1, Medium: 1.25, Large: 1.5 };
  SERVICES.forEach((name, i) => {
    const { lastInsertRowid: sid } = insService.run(name, i + 1);
    for (const size of CAR_SIZES) insPrice.run(sid, size, base[i] * sizeFactor[size]);
  });

  const { lastInsertRowid: locId } = db
    .prepare('INSERT INTO locations (name, address) VALUES (?, ?)')
    .run('Main Branch', '');

  db.prepare(
    'INSERT INTO users (name, username, password_hash, role, location_id) VALUES (?, ?, ?, ?, ?)'
  ).run('Owner', 'admin', hashPassword(process.env.ADMIN_PASSWORD || 'changeme123'), 'owner', null);

  const insItem = db.prepare('INSERT INTO inventory_items (name, unit, reorder_level) VALUES (?, ?, ?)');
  [
    ['Car shampoo', 'litres', 10],
    ['Wax', 'tins', 3],
    ['Tyre shine', 'bottles', 3],
    ['Dashboard polish', 'bottles', 3],
    ['Microfibre towels', 'pieces', 20],
    ['Air freshener', 'pieces', 10],
  ].forEach((r) => insItem.run(...r));
  void locId;
  db.exec('COMMIT');
}

export function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function normalizePlate(plate) {
  return String(plate || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
