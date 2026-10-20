// In-browser data store. Everything lives in localStorage, so each browser has its own copy of the data.

const STORAGE_KEY = 'jd_db_v1';

export const CAR_SIZES = ['Small', 'Medium', 'Large'];
export const SERVICES = ['Basic', 'Standard', 'Premium', 'Luxury VIP', 'Super Deluxe', 'Executive'];

const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const today = () => fmtDate(new Date());

export function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return fmtDate(d);
}

export function nowStamp(date = today()) {
  const d = new Date();
  return `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export const normalizePlate = (plate) => String(plate || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export async function hashPassword(username, password) {
  const bytes = new TextEncoder().encode(`jd:${String(username).toLowerCase()}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

let db = null;
let memoryOnly = false;

export function getDb() {
  if (db) return db;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) db = JSON.parse(raw);
  } catch {
    memoryOnly = true;
  }
  return db;
}

export function save() {
  if (memoryOnly || !db) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    memoryOnly = true;
  }
}

export function nextId(table) {
  db.seq[table] = (db.seq[table] || 0) + 1;
  return db.seq[table];
}

export function insert(table, row) {
  const rec = { id: nextId(table), ...row };
  db[table].push(rec);
  return rec;
}

/** Run a mutation; on error, roll back to the last saved state. */
export function tx(fn) {
  const snapshot = JSON.stringify(db);
  try {
    const r = fn();
    save();
    return r;
  } catch (e) {
    db = JSON.parse(snapshot);
    throw e;
  }
}

// ---------- seed ----------
export const DEMO_ACCOUNTS = [
  { role: 'owner', name: 'Owner', username: 'admin', password: 'changeme123', location: null },
  { role: 'manager', name: 'Aisha Bello', username: 'aisha', password: 'secret1', location: 1 },
  { role: 'sales', name: 'Musa Ibrahim', username: 'musa', password: 'secret1', location: 1 },
  { role: 'manager', name: 'Sani Abubakar', username: 'sani', password: 'secret1', location: 2 },
  { role: 'sales', name: 'Grace Danjuma', username: 'grace', password: 'secret1', location: 2 },
];

// Small deterministic random generator so the demo data is the same every reset.
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

let seeding = null;

/** Build the demo database once; concurrent callers share the same run. */
export function seed() {
  seeding ||= buildSeed().finally(() => (seeding = null));
  return seeding;
}

async function buildSeed() {
  const t = today();
  // Hash first: everything after this point is synchronous, so nothing can interleave with it.
  const hashes = await Promise.all(DEMO_ACCOUNTS.map((a) => hashPassword(a.username, a.password)));
  db = {
    seq: {},
    locations: [],
    users: [],
    services: [],
    prices: [],
    vehicles: [],
    packages: [],
    cards: [],
    memberships: [],
    visits: [],
    inventory_items: [],
    inventory_entries: [],
  };

  // Placeholder prices — the owner changes these under Service prices.
  const base = [3000, 5000, 8000, 12000, 18000, 25000];
  const factor = { Small: 1, Medium: 1.25, Large: 1.5 };
  SERVICES.forEach((name, i) => {
    const s = insert('services', { name, sort: i + 1 });
    CAR_SIZES.forEach((size) => db.prices.push({ service_id: s.id, car_size: size, amount: base[i] * factor[size] }));
  });

  insert('locations', { name: 'Main Branch', address: 'Ahmadu Bello Way, Kaduna', active: 1 });
  insert('locations', { name: 'Barnawa Branch', address: 'Barnawa, Kaduna', active: 1 });

  for (const [i, a] of DEMO_ACCOUNTS.entries()) {
    insert('users', {
      name: a.name,
      username: a.username,
      password_hash: hashes[i],
      role: a.role,
      location_id: a.location,
      active: 1,
      created_at: nowStamp(addDays(t, -30)),
    });
  }

  [
    ['Car shampoo', 'litres', 10],
    ['Wax', 'tins', 3],
    ['Tyre shine', 'bottles', 3],
    ['Dashboard polish', 'bottles', 3],
    ['Microfibre towels', 'pieces', 20],
    ['Air freshener', 'pieces', 10],
  ].forEach(([name, unit, reorder_level]) => insert('inventory_items', { name, unit, reorder_level, active: 1 }));

  insert('packages', {
    name: 'Premium Monthly', service_id: 3, washes: 4, discount_pct: 15, validity_days: 30,
    price_small: 28000, price_medium: 35000, price_large: 42000, active: 1,
  });
  insert('packages', {
    name: 'Executive Quarterly', service_id: 6, washes: 6, discount_pct: 25, validity_days: 90,
    price_small: 130000, price_medium: 160000, price_large: 200000, active: 1,
  });

  for (let i = 1; i <= 300; i++) {
    insert('cards', {
      serial: `JD-${String(i).padStart(5, '0')}`,
      seq: i,
      location_id: i <= 200 ? 1 : 2,
      status: 'available',
      created_at: nowStamp(addDays(t, -30)),
    });
  }

  // Customers
  const rand = rng(42);
  const cars = [
    ['Toyota Camry', 'Medium'], ['Toyota Corolla', 'Small'], ['Honda Accord', 'Medium'], ['Lexus RX350', 'Large'],
    ['Toyota Hilux', 'Large'], ['Kia Rio', 'Small'], ['Hyundai Elantra', 'Small'], ['Toyota Sienna', 'Large'],
    ['Mercedes C300', 'Medium'], ['Ford Explorer', 'Large'], ['Honda CR-V', 'Medium'], ['Peugeot 406', 'Small'],
  ];
  const colours = ['Black', 'White', 'Silver', 'Grey', 'Blue', 'Red', 'Gold'];
  const names = ['Halima Yusuf', 'Ibrahim Musa', 'Chidi Okeke', 'Fatima Sani', 'Emeka Obi', 'Zainab Aliyu', '', 'Yakubu Garba', 'Blessing John', '', 'Usman Lawal', 'Amina Bello'];
  const areas = ['Malali GRA', 'Barnawa', 'Ungwan Rimi', 'Sabon Tasha', 'Kawo', 'Narayi', 'Unguwan Dosa'];
  const prefixes = ['KAD', 'KTG', 'ABJ', 'ZAR', 'KAN'];
  for (let i = 0; i < 24; i++) {
    const [car_type, car_size] = cars[i % cars.length];
    const created = addDays(t, -20 + Math.floor(rand() * 5));
    insert('vehicles', {
      plate: `${prefixes[i % prefixes.length]}${100 + Math.floor(rand() * 900)}${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(rand() * 26))}`,
      customer_name: names[i % names.length] || null,
      car_type,
      car_size,
      color: colours[Math.floor(rand() * colours.length)],
      phone: `080${String(30000000 + Math.floor(rand() * 69999999)).padStart(8, '0')}`,
      address: `${1 + Math.floor(rand() * 60)} ${areas[i % areas.length]}, Kaduna`,
      first_location_id: (i % 3) + 1 > 2 ? 2 : 1,
      created_at: nowStamp(created),
      updated_at: nowStamp(created),
    });
  }

  // Memberships (sold 2–10 days ago)
  const sellers = { 1: [3, 2], 2: [5, 4] };
  const cardNext = { 1: 1, 2: 201 };
  [0, 3, 8, 13, 17].forEach((vi, k) => {
    const v = db.vehicles[vi];
    const loc = k % 2 === 0 ? 1 : 2;
    const pkg = db.packages[k === 3 ? 1 : 0];
    const start = addDays(t, -(2 + k * 2));
    const seq = cardNext[loc]++;
    const card = db.cards.find((c) => c.seq === seq);
    card.status = 'sold';
    insert('memberships', {
      card_id: card.id, vehicle_id: v.id, package_id: pkg.id, service_id: pkg.service_id, location_id: loc,
      sold_by: sellers[loc][0], recorded_by: sellers[loc][0], customer_status: 'existing',
      amount_paid: pkg[`price_${v.car_size.toLowerCase()}`], washes_total: pkg.washes, washes_used: 0,
      discount_pct: pkg.discount_pct, start_date: start, expiry_date: addDays(start, pkg.validity_days),
      created_at: nowStamp(start),
    });
  });

  // Visits over the last 14 days
  const seen = new Set();
  for (let day = 13; day >= 0; day--) {
    const date = addDays(t, -day);
    const count = 4 + Math.floor(rand() * 6);
    for (let n = 0; n < count; n++) {
      const v = db.vehicles[Math.floor(rand() * db.vehicles.length)];
      const loc = v.first_location_id;
      const r = rand();
      const service_id = r < 0.3 ? 1 : r < 0.55 ? 2 : r < 0.75 ? 3 : r < 0.87 ? 4 : r < 0.95 ? 5 : 6;
      const list = db.prices.find((p) => p.service_id === service_id && p.car_size === v.car_size).amount;
      const m = db.memberships.find(
        (x) => x.vehicle_id === v.id && x.start_date <= date && x.expiry_date >= date
      );
      let discount = 0, membership_id = null, used = 0;
      if (m && m.service_id === service_id && m.washes_used < m.washes_total) {
        m.washes_used++;
        discount = list; membership_id = m.id; used = 1;
      } else if (m) {
        discount = Math.round((list * m.discount_pct) / 100); membership_id = m.id;
      }
      const hour = 8 + Math.floor((n / count) * 10);
      insert('visits', {
        vehicle_id: v.id, location_id: loc, service_id, car_size: v.car_size,
        customer_status: seen.has(v.id) ? 'existing' : 'new',
        list_price: list, discount, amount_paid: list - discount, membership_id, used_membership_wash: used,
        recorded_by: loc === 1 ? 2 : 4, visit_date: date,
        created_at: `${date} ${pad(hour)}:${pad(Math.floor(rand() * 60))}:00`,
      });
      seen.add(v.id);
    }
  }

  // Inventory for the last 7 days (up to yesterday) at both locations
  const usage = { 1: [4, 6], 2: [0, 1], 3: [0, 1], 4: [0, 1], 5: [1, 4], 6: [1, 3] };
  const start = { 1: 40, 2: 8, 3: 8, 4: 6, 5: 60, 6: 30 };
  for (const loc of [1, 2]) {
    for (const item of db.inventory_items) {
      let stock = start[item.id];
      for (let day = 7; day >= 1; day--) {
        const [lo, hi] = usage[item.id];
        const used = lo + Math.floor(rand() * (hi - lo + 1));
        const received = day === 4 && item.id === 1 ? 20 : 0;
        const closing = Math.max(0, stock + received - used);
        insert('inventory_entries', {
          location_id: loc, item_id: item.id, entry_date: addDays(t, -day), opening: stock, received,
          used: stock + received - closing, closing, note: received ? 'Delivery' : null,
          recorded_by: loc === 1 ? 2 : 4, updated_at: nowStamp(addDays(t, -day)),
        });
        stock = closing;
      }
    }
  }

  save();
  return db;
}

export function resetDb() {
  db = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
