// Request handlers that run in the browser. They mirror the old Express API one-to-one,
// so the pages call api('/visits') etc. exactly as before.
import {
  CAR_SIZES, DEMO_ACCOUNTS, addDays, getDb, hashPassword, insert, normalizePlate, nowStamp, resetDb, save, seed,
  today, tx,
} from './store';

const SESSION_KEY = 'jd_session_user';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new HttpError(status, message);
};

const num = (v, name, { min = 0 } = {}) => {
  const n = Number(v);
  if (v === '' || v === null || !Number.isFinite(n) || n < min) fail(400, `${name} must be a number${min === 0 ? ' (0 or more)' : ''}`);
  return n;
};
const text = (v, name, { required = true } = {}) => {
  const s = String(v ?? '').trim();
  if (required && !s) fail(400, `${name} is required`);
  return s;
};
const isOff = (v) => v === false || v === 0 || v === '0';

// ---------- session ----------
function currentUser(db) {
  let id = null;
  try {
    id = Number(localStorage.getItem(SESSION_KEY));
  } catch {
    /* ignore */
  }
  const u = id && db.users.find((x) => x.id === id && x.active);
  if (!u) return null;
  const loc = db.locations.find((l) => l.id === u.location_id);
  return { id: u.id, name: u.name, username: u.username, role: u.role, location_id: u.location_id, location_name: loc?.name ?? null };
}
function setSession(id) {
  try {
    if (id) localStorage.setItem(SESSION_KEY, String(id));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

// ---------- lookups ----------
const byId = (rows, id) => rows.find((r) => r.id === Number(id));
const sum = (rows, k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
const byDesc = (k) => (a, b) => (a[k] < b[k] ? 1 : a[k] > b[k] ? -1 : b.id - a.id);

function membershipStatus(m) {
  if (m.expiry_date < today()) return 'expired';
  if (m.washes_used >= m.washes_total) return 'used up';
  return 'active';
}
function enrichMembership(db, m) {
  const v = byId(db.vehicles, m.vehicle_id);
  return {
    ...m,
    serial: byId(db.cards, m.card_id)?.serial,
    package_name: byId(db.packages, m.package_id)?.name,
    service_name: byId(db.services, m.service_id)?.name,
    location_name: byId(db.locations, m.location_id)?.name,
    sold_by_name: byId(db.users, m.sold_by)?.name,
    plate: v?.plate,
    customer_name: v?.customer_name,
    phone: v?.phone,
    car_type: v?.car_type,
    color: v?.color,
    status: membershipStatus(m),
  };
}

/** Location to read from: owner may pick any (or all = null); staff are locked to their own. */
function readLocation(user, query) {
  if (user.role === 'owner') return query.get('location_id') ? Number(query.get('location_id')) : null;
  return user.location_id;
}
/** Location to write to: owner must choose one; staff use their own. */
function writeLocation(db, user, body) {
  if (user.role === 'owner') {
    const id = Number(body.location_id);
    if (!id) fail(400, 'Choose a location');
    if (!byId(db.locations, id)) fail(400, 'Unknown location');
    return id;
  }
  if (!user.location_id) fail(400, 'Your account is not assigned to a location');
  return user.location_id;
}

function upsertVehicle(db, body, locationId) {
  const plate = normalizePlate(body.plate);
  if (plate.length < 3) fail(400, 'Enter a valid plate number');
  const fields = {
    customer_name: text(body.customer_name, 'Customer name', { required: false }) || null,
    car_type: text(body.car_type, 'Car type'),
    car_size: text(body.car_size, 'Car size'),
    color: text(body.color, 'Car colour'),
    phone: text(body.phone, 'Phone number'),
    address: text(body.address, 'Home address', { required: false }) || null,
  };
  if (!CAR_SIZES.includes(fields.car_size)) fail(400, 'Choose a car size');
  const existing = db.vehicles.find((v) => v.plate === plate);
  if (existing) {
    Object.assign(existing, fields, { updated_at: nowStamp() });
    return { vehicle: existing, isNew: false };
  }
  const vehicle = insert('vehicles', {
    plate, ...fields, first_location_id: locationId, created_at: nowStamp(), updated_at: nowStamp(),
  });
  return { vehicle, isNew: true };
}

/**
 * Pricing rules:
 *  - list price comes from the price table (service × car size)
 *  - if the vehicle has an active membership for this service with washes left and
 *    use_membership is on, the wash is free and one wash is deducted
 *  - otherwise the best discount from any unexpired membership applies
 */
function priceVisit(db, vehicleId, serviceId, carSize, useMembership) {
  const p = db.prices.find((x) => x.service_id === serviceId && x.car_size === carSize);
  if (!p) fail(400, 'No price set for this service and car size');
  const list = p.amount;
  const result = { list_price: list, discount: 0, amount_paid: list, membership_id: null, used_membership_wash: 0 };
  if (!vehicleId) return result;

  const valid = db.memberships
    .filter((m) => m.vehicle_id === vehicleId && m.expiry_date >= today())
    .sort((a, b) => (a.expiry_date < b.expiry_date ? -1 : 1));
  const cover = valid.find((m) => m.service_id === serviceId && m.washes_used < m.washes_total);
  if (cover && useMembership) {
    return { ...result, discount: list, amount_paid: 0, membership_id: cover.id, used_membership_wash: 1 };
  }
  const best = valid.reduce((a, m) => (!a || m.discount_pct > a.discount_pct ? m : a), null);
  if (best && best.discount_pct > 0) {
    const discount = Math.round((list * best.discount_pct) / 100);
    return { ...result, discount, amount_paid: list - discount, membership_id: best.id };
  }
  return result;
}

function previousClosing(db, locationId, itemId, date) {
  const prev = db.inventory_entries
    .filter((e) => e.location_id === locationId && e.item_id === itemId && e.entry_date < date)
    .sort(byDesc('entry_date'))[0];
  return prev ? prev.closing : null;
}

function lowStock(db, loc) {
  const out = [];
  for (const l of db.locations) {
    if (loc && l.id !== loc) continue;
    for (const i of db.inventory_items.filter((x) => x.active)) {
      const last = db.inventory_entries
        .filter((e) => e.location_id === l.id && e.item_id === i.id)
        .sort(byDesc('entry_date'))[0];
      if (last && last.closing <= i.reorder_level) {
        out.push({ location_name: l.name, name: i.name, unit: i.unit, reorder_level: i.reorder_level, closing: last.closing, entry_date: last.entry_date });
      }
    }
  }
  return out;
}

function packageFields(db, b) {
  const f = {
    name: text(b.name, 'Package name'),
    service_id: Number(b.service_id),
    washes: num(b.washes, 'Number of washes', { min: 1 }),
    discount_pct: num(b.discount_pct ?? 0, 'Discount'),
    validity_days: num(b.validity_days, 'Validity (days)', { min: 1 }),
    price_small: num(b.price_small, 'Price (Small)'),
    price_medium: num(b.price_medium, 'Price (Medium)'),
    price_large: num(b.price_large, 'Price (Large)'),
    active: isOff(b.active) ? 0 : 1,
  };
  if (f.discount_pct > 100) fail(400, 'Discount cannot be more than 100%');
  if (!byId(db.services, f.service_id)) fail(400, 'Choose a service');
  return f;
}

function userLocation(db, role, locationId) {
  if (role === 'owner') return null;
  const id = Number(locationId);
  if (!id || !byId(db.locations, id)) fail(400, 'Managers and sales staff need a location');
  return id;
}

// ---------- routes ----------
// Each route: [method, pattern, roles (null = public, [] = any signed-in user), handler]
const ALL = [];
const OM = ['owner', 'manager'];
const O = ['owner'];

const routes = [
  ['POST', '/login', null, async ({ db, body }) => {
    const username = String(body.username || '').trim().toLowerCase();
    const u = db.users.find((x) => x.username.toLowerCase() === username && x.active);
    if (!u || u.password_hash !== (await hashPassword(username, String(body.password || '')))) {
      fail(401, 'Wrong username or password');
    }
    setSession(u.id);
    return { ok: true };
  }],

  // One-click demo sign-in by role (used by the buttons on the login page).
  ['POST', '/demo/login', null, ({ db, body }) => {
    const u = db.users.find((x) => x.role === body.role && x.active);
    if (!u) fail(404, 'No active account with that role');
    setSession(u.id);
    return { ok: true };
  }],

  ['POST', '/demo/reset', O, async () => {
    resetDb();
    await seed();
    return { ok: true };
  }],

  ['POST', '/logout', null, () => {
    setSession(null);
    return { ok: true };
  }],

  ['GET', '/me', ALL, ({ user }) => user],

  ['POST', '/me/password', ALL, async ({ db, user, body }) => {
    const u = byId(db.users, user.id);
    if (u.password_hash !== (await hashPassword(u.username, String(body.current || '')))) fail(400, 'Current password is wrong');
    if (String(body.next || '').length < 6) fail(400, 'New password must be at least 6 characters');
    u.password_hash = await hashPassword(u.username, body.next);
    save();
    return { ok: true };
  }],

  ['GET', '/meta', ALL, ({ db, user }) => ({
    services: [...db.services].sort((a, b) => a.sort - b.sort).map(({ id, name }) => ({ id, name })),
    prices: db.prices,
    sizes: CAR_SIZES,
    locations: [...db.locations].sort((a, b) => a.name.localeCompare(b.name)),
    packages: db.packages
      .map((p) => ({ ...p, service_name: byId(db.services, p.service_id)?.name, _sort: byId(db.services, p.service_id)?.sort }))
      .sort((a, b) => a._sort - b._sort || a.name.localeCompare(b.name)),
    items: [...db.inventory_items].sort((a, b) => a.name.localeCompare(b.name)),
    salesStaff: db.users
      .filter((u) => u.active && ['sales', 'manager'].includes(u.role) && (user.role === 'owner' || u.location_id === user.location_id))
      .map(({ id, name, role, location_id }) => ({ id, name, role, location_id }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    today: today(),
  })],

  ['GET', '/vehicles/lookup/:plate', ALL, ({ db, params }) => {
    const v = db.vehicles.find((x) => x.plate === normalizePlate(params.plate));
    if (!v) return { found: false };
    const visits = db.visits
      .filter((x) => x.vehicle_id === v.id)
      .sort(byDesc('created_at'))
      .slice(0, 20)
      .map((x) => ({ ...x, service_name: byId(db.services, x.service_id)?.name, location_name: byId(db.locations, x.location_id)?.name }));
    const memberships = db.memberships
      .filter((m) => m.vehicle_id === v.id)
      .sort(byDesc('created_at'))
      .map((m) => enrichMembership(db, m));
    return { found: true, vehicle: v, memberships, visits };
  }],

  ['GET', '/vehicles', ALL, ({ db, query }) => {
    const q = String(query.get('q') || '').trim().toLowerCase();
    const plateQ = normalizePlate(q);
    const t = today();
    return db.vehicles
      .filter(
        (v) =>
          !q ||
          (plateQ && v.plate.includes(plateQ)) ||
          (v.phone || '').includes(q) ||
          (v.customer_name || '').toLowerCase().includes(q) ||
          v.car_type.toLowerCase().includes(q)
      )
      .map((v) => {
        const visits = db.visits.filter((x) => x.vehicle_id === v.id);
        return {
          ...v,
          visit_count: visits.length,
          last_visit: visits.reduce((mx, x) => (x.visit_date > (mx || '') ? x.visit_date : mx), null),
          active_memberships: db.memberships.filter(
            (m) => m.vehicle_id === v.id && m.expiry_date >= t && m.washes_used < m.washes_total
          ).length,
        };
      })
      .sort(byDesc('updated_at'))
      .slice(0, 200);
  }],

  ['POST', '/visits/quote', ALL, ({ db, body }) => {
    const v = db.vehicles.find((x) => x.plate === normalizePlate(body.plate));
    return priceVisit(db, v?.id, Number(body.service_id), body.car_size, body.use_membership !== false);
  }],

  ['POST', '/visits', OM, ({ db, user, body }) => {
    const locationId = writeLocation(db, user, body);
    const serviceId = Number(body.service_id);
    if (!byId(db.services, serviceId)) fail(400, 'Choose a service');
    return tx(() => {
      const d = getDb();
      const { vehicle, isNew } = upsertVehicle(d, body, locationId);
      const q = priceVisit(d, vehicle.id, serviceId, vehicle.car_size, body.use_membership !== false);
      if (q.used_membership_wash) byId(d.memberships, q.membership_id).washes_used++;
      const status = isNew ? 'new' : 'existing';
      const visit = insert('visits', {
        vehicle_id: vehicle.id, location_id: locationId, service_id: serviceId, car_size: vehicle.car_size,
        customer_status: status, ...q, recorded_by: user.id, visit_date: today(), created_at: nowStamp(),
      });
      return { id: visit.id, ...q, customer_status: status, plate: vehicle.plate };
    });
  }],

  ['GET', '/visits', ALL, ({ db, user, query }) => {
    const loc = readLocation(user, query);
    const from = query.get('from') || today();
    const to = query.get('to') || from;
    return db.visits
      .filter((v) => v.visit_date >= from && v.visit_date <= to && (!loc || v.location_id === loc))
      .sort(byDesc('created_at'))
      .map((v) => {
        const ve = byId(db.vehicles, v.vehicle_id);
        const m = v.membership_id && byId(db.memberships, v.membership_id);
        return {
          ...v,
          plate: ve.plate, car_type: ve.car_type, color: ve.color, phone: ve.phone, address: ve.address,
          customer_name: ve.customer_name,
          service_name: byId(db.services, v.service_id)?.name,
          location_name: byId(db.locations, v.location_id)?.name,
          recorded_by_name: byId(db.users, v.recorded_by)?.name,
          card_serial: m ? byId(db.cards, m.card_id)?.serial : null,
        };
      });
  }],

  ['GET', '/cards', ALL, ({ db, user, query }) => {
    const loc = readLocation(user, query);
    const status = query.get('status') || null;
    const inLoc = (c) => !loc || c.location_id === loc || c.location_id === null;
    const cards = db.cards
      .filter((c) => (!status || c.status === status) && inLoc(c))
      .sort((a, b) => a.seq - b.seq)
      .slice(0, 2000)
      .map((c) => {
        const m = db.memberships.find((x) => x.card_id === c.id);
        return {
          ...c,
          location_name: byId(db.locations, c.location_id)?.name ?? null,
          plate: m ? byId(db.vehicles, m.vehicle_id)?.plate : null,
          membership_id: m?.id ?? null,
        };
      });
    const counts = {};
    db.cards.filter(inLoc).forEach((c) => (counts[c.status] = (counts[c.status] || 0) + 1));
    return { cards, summary: Object.entries(counts).map(([s, n]) => ({ status: s, n })) };
  }],

  /** Register a batch of pre-printed cards, e.g. prefix "JD-", start 1, count 500, digits 5 → JD-00001…JD-00500 */
  ['POST', '/cards/batch', O, ({ body }) => {
    const prefix = String(body.prefix ?? '').trim();
    const start = num(body.start, 'Start number', { min: 1 });
    const count = num(body.count, 'Number of cards', { min: 1 });
    const digits = num(body.digits ?? 5, 'Digits', { min: 1 });
    if (count > 10000) fail(400, 'Register at most 10,000 cards at a time');
    const locationId = body.location_id ? Number(body.location_id) : null;
    const added = tx(() => {
      const d = getDb();
      const existing = new Set(d.cards.map((c) => c.serial.toUpperCase()));
      let n = 0;
      for (let i = 0; i < count; i++) {
        const seq = start + i;
        const serial = prefix + String(seq).padStart(digits, '0');
        if (existing.has(serial.toUpperCase())) continue;
        insert('cards', { serial, seq, location_id: locationId, status: 'available', created_at: nowStamp() });
        n++;
      }
      return n;
    });
    return { added, skipped: count - added };
  }],

  ['PATCH', '/cards/:id', O, ({ db, params, body }) => {
    const card = byId(db.cards, params.id);
    if (!card) fail(404, 'Card not found');
    if (card.status === 'sold') fail(400, 'This card is already sold and cannot be changed');
    const status = body.status ?? card.status;
    if (!['available', 'void'].includes(status)) fail(400, 'Invalid status');
    card.status = status;
    if (body.location_id !== undefined) card.location_id = body.location_id ? Number(body.location_id) : null;
    save();
    return { ok: true };
  }],

  ['POST', '/memberships', ['owner', 'manager', 'sales'], ({ db, user, body }) => {
    const locationId = writeLocation(db, user, body);
    const pkg = db.packages.find((p) => p.id === Number(body.package_id) && p.active);
    if (!pkg) fail(400, 'Choose a package');

    const serial = text(body.card_serial, 'Card serial number').toUpperCase();
    const card = db.cards.find((c) => c.serial.toUpperCase() === serial);
    if (!card) fail(400, `Card ${serial} is not registered. Ask the owner to register this card batch.`);
    if (card.status === 'sold') fail(400, `Card ${serial} has already been sold`);
    if (card.status === 'void') fail(400, `Card ${serial} has been voided`);
    if (card.location_id && card.location_id !== locationId) fail(400, `Card ${serial} belongs to another location`);

    // Sales staff are credited with their own sales; managers/owner pick who made the sale.
    let soldBy = user.id;
    if (user.role !== 'sales' && body.sold_by) {
      const seller = db.users.find((u) => u.id === Number(body.sold_by) && u.active);
      if (!seller) fail(400, 'Unknown sales person');
      soldBy = seller.id;
    }

    return tx(() => {
      const d = getDb();
      const { vehicle, isNew } = upsertVehicle(d, body, locationId);
      const amount = pkg[`price_${vehicle.car_size.toLowerCase()}`];
      const start = today();
      const expiry = addDays(start, pkg.validity_days);
      const m = insert('memberships', {
        card_id: card.id, vehicle_id: vehicle.id, package_id: pkg.id, service_id: pkg.service_id,
        location_id: locationId, sold_by: soldBy, recorded_by: user.id, customer_status: isNew ? 'new' : 'existing',
        amount_paid: amount, washes_total: pkg.washes, washes_used: 0, discount_pct: pkg.discount_pct,
        start_date: start, expiry_date: expiry, created_at: nowStamp(),
      });
      const c = byId(d.cards, card.id);
      c.status = 'sold';
      c.location_id = locationId;
      return { id: m.id, amount_paid: amount, serial: card.serial, expiry_date: expiry };
    });
  }],

  ['GET', '/memberships', ALL, ({ db, user, query }) => {
    const loc = readLocation(user, query);
    const status = query.get('status') || 'all';
    const soldBy = user.role === 'sales' && query.get('mine') === '1' ? user.id : null;
    return db.memberships
      .filter((m) => (!loc || m.location_id === loc) && (!soldBy || m.sold_by === soldBy))
      .map((m) => enrichMembership(db, m))
      .filter((m) => status === 'all' || m.status === status)
      .sort(byDesc('created_at'))
      .slice(0, 1000);
  }],

  ['GET', '/inventory', OM, ({ db, user, query }) => {
    const loc = user.role === 'owner' ? Number(query.get('location_id')) : user.location_id;
    if (!loc) fail(400, 'Choose a location');
    const date = query.get('date') || today();
    return db.inventory_items
      .filter((i) => i.active)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((item) => {
        const e = db.inventory_entries.find((x) => x.location_id === loc && x.item_id === item.id && x.entry_date === date);
        return {
          item,
          entry: e ? { ...e, recorded_by_name: byId(db.users, e.recorded_by)?.name } : null,
          previous_closing: previousClosing(db, loc, item.id, date),
        };
      });
  }],

  ['PUT', '/inventory', OM, ({ db, user, body }) => {
    const locationId = writeLocation(db, user, body);
    const date = text(body.date, 'Date');
    if (date > today()) fail(400, 'You cannot record stock for a future date');
    const entries = Array.isArray(body.entries) ? body.entries : [];
    tx(() => {
      const d = getDb();
      for (const e of entries) {
        const itemId = Number(e.item_id);
        const item = byId(d.inventory_items, itemId);
        if (!item) fail(400, 'Unknown inventory item');
        const received = num(e.received ?? 0, `${item.name}: received`);
        const used = num(e.used ?? 0, `${item.name}: used`);
        const prev = previousClosing(d, locationId, itemId, date);
        // Opening carries over from the last recorded closing; it can only be typed in for an item's first entry.
        const opening = prev ?? num(e.opening ?? 0, `${item.name}: opening stock`);
        const closing = opening + received - used;
        if (closing < 0) fail(400, `${item.name}: used (${used}) is more than available stock (${opening + received})`);
        const row = { opening, received, used, closing, note: e.note || null, recorded_by: user.id, updated_at: nowStamp() };
        const existing = d.inventory_entries.find(
          (x) => x.location_id === locationId && x.item_id === itemId && x.entry_date === date
        );
        if (existing) Object.assign(existing, row);
        else insert('inventory_entries', { location_id: locationId, item_id: itemId, entry_date: date, ...row });

        // Re-chain later days so their opening matches the new closing.
        d.inventory_entries
          .filter((x) => x.location_id === locationId && x.item_id === itemId && x.entry_date > date)
          .sort((a, b) => (a.entry_date < b.entry_date ? -1 : 1))
          .forEach((x) => {
            x.opening = previousClosing(d, locationId, itemId, x.entry_date);
            x.closing = x.opening + x.received - x.used;
          });
      }
    });
    return { ok: true };
  }],

  ['GET', '/dashboard', ALL, ({ db, user, query }) => {
    const loc = readLocation(user, query);
    const from = query.get('from') || today();
    const to = query.get('to') || from;
    const inRange = (d) => d >= from && d <= to;
    const visits = db.visits.filter((v) => inRange(v.visit_date) && (!loc || v.location_id === loc));
    const memberships = db.memberships.filter((m) => inRange(m.start_date) && (!loc || m.location_id === loc));

    const bySellerMap = new Map();
    for (const m of memberships) {
      const r = bySellerMap.get(m.sold_by) || {
        name: byId(db.users, m.sold_by)?.name, location_name: byId(db.locations, m.location_id)?.name, sold: 0, revenue: 0,
      };
      r.sold++;
      r.revenue += m.amount_paid;
      bySellerMap.set(m.sold_by, r);
    }

    return {
      from,
      to,
      visits: {
        cars: visits.length,
        revenue: sum(visits, 'amount_paid'),
        new_customers: visits.filter((v) => v.customer_status === 'new').length,
        existing_customers: visits.filter((v) => v.customer_status === 'existing').length,
        membership_washes: sum(visits, 'used_membership_wash'),
        discounts: sum(visits, 'discount'),
      },
      memberships: { sold: memberships.length, revenue: sum(memberships, 'amount_paid') },
      byService: [...db.services]
        .sort((a, b) => a.sort - b.sort)
        .map((s) => {
          const vs = visits.filter((v) => v.service_id === s.id);
          return { name: s.name, cars: vs.length, revenue: sum(vs, 'amount_paid') };
        }),
      byLocation: [...db.locations]
        .filter((l) => !loc || l.id === loc)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((l) => {
          const vs = db.visits.filter((v) => v.location_id === l.id && inRange(v.visit_date));
          const ms = db.memberships.filter((m) => m.location_id === l.id && inRange(m.start_date));
          return {
            name: l.name, cars: vs.length, wash_revenue: sum(vs, 'amount_paid'),
            memberships: ms.length, membership_revenue: sum(ms, 'amount_paid'),
          };
        }),
      bySeller: [...bySellerMap.values()].sort((a, b) => b.revenue - a.revenue),
      cardsLeft: db.cards.filter((c) => c.status === 'available' && (!loc || c.location_id === loc || c.location_id === null)).length,
      lowStock: user.role === 'sales' ? [] : lowStock(db, loc),
    };
  }],

  // ---------- owner settings ----------
  ['PUT', '/prices', O, ({ body }) => {
    const rows = Array.isArray(body) ? body : [];
    tx(() => {
      const d = getDb();
      rows.forEach((r) => {
        const p = d.prices.find((x) => x.service_id === Number(r.service_id) && x.car_size === r.car_size);
        if (p) p.amount = num(r.amount, 'Price');
      });
    });
    return { ok: true };
  }],

  ['POST', '/packages', O, ({ db, body }) => {
    const f = packageFields(db, body);
    insert('packages', f);
    save();
    return { ok: true };
  }],
  ['PUT', '/packages/:id', O, ({ db, params, body }) => {
    const p = byId(db.packages, params.id);
    if (!p) fail(404, 'Package not found');
    Object.assign(p, packageFields(db, body));
    save();
    return { ok: true };
  }],

  ['POST', '/locations', O, ({ db, body }) => {
    const name = text(body.name, 'Location name');
    if (db.locations.some((l) => l.name.toLowerCase() === name.toLowerCase())) fail(400, 'That location already exists');
    insert('locations', { name, address: text(body.address, 'Address', { required: false }), active: 1 });
    save();
    return { ok: true };
  }],
  ['PUT', '/locations/:id', O, ({ db, params, body }) => {
    const l = byId(db.locations, params.id);
    if (!l) fail(404, 'Location not found');
    Object.assign(l, {
      name: text(body.name, 'Location name'),
      address: text(body.address, 'Address', { required: false }),
      active: isOff(body.active) ? 0 : 1,
    });
    save();
    return { ok: true };
  }],

  ['GET', '/users', O, ({ db }) =>
    db.users
      .map(({ password_hash: _omit, ...u }) => ({ ...u, location_name: byId(db.locations, u.location_id)?.name ?? null }))
      .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name))],

  ['POST', '/users', O, async ({ db, body }) => {
    const role = text(body.role, 'Role');
    if (!['owner', 'manager', 'sales'].includes(role)) fail(400, 'Invalid role');
    const password = String(body.password || '');
    if (password.length < 6) fail(400, 'Password must be at least 6 characters');
    const username = text(body.username, 'Username').toLowerCase();
    if (db.users.some((u) => u.username.toLowerCase() === username)) fail(400, 'That username is taken');
    const name = text(body.name, 'Name');
    const location_id = userLocation(db, role, body.location_id);
    insert('users', {
      name, username, password_hash: await hashPassword(username, password), role, location_id, active: 1,
      created_at: nowStamp(),
    });
    save();
    return { ok: true };
  }],

  ['PUT', '/users/:id', O, async ({ db, user, params, body }) => {
    const u = byId(db.users, params.id);
    if (!u) fail(404, 'User not found');
    const role = text(body.role, 'Role');
    if (!['owner', 'manager', 'sales'].includes(role)) fail(400, 'Invalid role');
    const active = isOff(body.active) ? 0 : 1;
    if (u.id === user.id && (!active || role !== 'owner')) fail(400, 'You cannot deactivate or demote your own account');
    const changes = { name: text(body.name, 'Name'), role, location_id: userLocation(db, role, body.location_id), active };
    if (body.password) {
      if (String(body.password).length < 6) fail(400, 'Password must be at least 6 characters');
      changes.password_hash = await hashPassword(u.username, body.password);
    }
    Object.assign(u, changes);
    save();
    return { ok: true };
  }],

  ['POST', '/items', O, ({ db, body }) => {
    const name = text(body.name, 'Item name');
    if (db.inventory_items.some((i) => i.name.toLowerCase() === name.toLowerCase())) fail(400, 'That item already exists');
    insert('inventory_items', {
      name, unit: text(body.unit, 'Unit'), reorder_level: num(body.reorder_level ?? 0, 'Reorder level'), active: 1,
    });
    save();
    return { ok: true };
  }],
  ['PUT', '/items/:id', O, ({ db, params, body }) => {
    const i = byId(db.inventory_items, params.id);
    if (!i) fail(404, 'Item not found');
    Object.assign(i, {
      name: text(body.name, 'Item name'),
      unit: text(body.unit, 'Unit'),
      reorder_level: num(body.reorder_level ?? 0, 'Reorder level'),
      active: isOff(body.active) ? 0 : 1,
    });
    save();
    return { ok: true };
  }],
];

const compiled = routes.map(([method, pattern, roles, handler]) => {
  const keys = [];
  const re = new RegExp(
    '^' + pattern.replace(/:([a-z_]+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$'
  );
  return { method, re, keys, roles, handler };
});

export async function handle(method, path, body) {
  const db = getDb() || (await seed());
  const [pathname, search = ''] = path.split('?');
  const query = new URLSearchParams(search);
  for (const r of compiled) {
    if (r.method !== method) continue;
    const m = pathname.match(r.re);
    if (!m) continue;
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    let user = null;
    if (r.roles) {
      user = currentUser(db);
      if (!user) fail(401, 'Please log in');
      if (r.roles.length && !r.roles.includes(user.role)) fail(403, 'You do not have access to this');
    }
    // Return a copy so pages never mutate stored records by accident.
    const result = await r.handler({ db: getDb(), user, params, query, body: body ?? {} });
    return result === undefined ? { ok: true } : JSON.parse(JSON.stringify(result));
  }
  fail(404, 'Not found');
}

export { DEMO_ACCOUNTS };
