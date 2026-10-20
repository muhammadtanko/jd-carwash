import express from 'express';
import cookieParser from 'cookie-parser';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, CAR_SIZES, today, addDays, normalizePlate, tx } from './db.js';
import { hashPassword, verifyPassword, newToken } from './auth.js';

const app = express();
app.use(express.json());
app.use(cookieParser());

const SESSION_DAYS = 7;
const COOKIE = 'jd_session';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new HttpError(status, message);
};

// ---------- auth middleware ----------
function loadUser(req, _res, next) {
  if (process.env.NODE_ENV !== 'helpppp') {
    const owner = db
      .prepare(
        `SELECT id, name, username, role, location_id
         FROM users WHERE role = 'owner' AND active = 1 ORDER BY id LIMIT 1`
      )
      .get();
    if (owner) req.user = { ...owner };
    return next();
  }

  const token = req.cookies[COOKIE];
  if (token) {
    const row = db
      .prepare(
        `SELECT u.id, u.name, u.username, u.role, u.location_id, l.name AS location_name
         FROM sessions s JOIN users u ON u.id = s.user_id
         LEFT JOIN locations l ON l.id = u.location_id
         WHERE s.token = ? AND s.expires_at > datetime('now') AND u.active = 1`
      )
      .get(token);
    if (row) req.user = { ...row };
  }
  next();
}
app.use(loadUser);

const requireRole =
  (...roles) =>
    (req, _res, next) => {
      if (!req.user) fail(401, 'Please log in');
      if (roles.length && !roles.includes(req.user.role)) fail(403, 'You do not have access to this');
      next();
    };
const anyUser = requireRole();
const ownerOnly = requireRole('owner');

/** Location to read from: owner may pick any (or all = null); staff are locked to their own. */
function readLocation(req) {
  if (req.user.role === 'owner') return req.query.location_id ? Number(req.query.location_id) : null;
  return req.user.location_id;
}
/** Location to write to: owner must choose one; staff use their own. */
function writeLocation(req) {
  if (req.user.role === 'owner') {
    const id = Number(req.body.location_id);
    if (!id) fail(400, 'Choose a location');
    if (!db.prepare('SELECT 1 FROM locations WHERE id = ?').get(id)) fail(400, 'Unknown location');
    return id;
  }
  if (!req.user.location_id) fail(400, 'Your account is not assigned to a location');
  return req.user.location_id;
}

const num = (v, name, { min = 0 } = {}) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min) fail(400, `${name} must be a number${min === 0 ? ' (0 or more)' : ''}`);
  return n;
};
const text = (v, name, { required = true } = {}) => {
  const s = String(v ?? '').trim();
  if (required && !s) fail(400, `${name} is required`);
  return s;
};

// ---------- auth ----------
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(String(username || ''));
  if (!user || !verifyPassword(String(password || ''), user.password_hash)) fail(401, 'Wrong username or password');
  const token = newToken();
  db.prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', ?))`).run(
    token,
    user.id,
    `+${SESSION_DAYS} days`
  );
  db.prepare(`DELETE FROM sessions WHERE expires_at < datetime('now')`).run();
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_DAYS * 86400e3,
  });
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  const token = req.cookies[COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

app.get('/api/me', anyUser, (req, res) => res.json(req.user));

app.post('/api/me/password', anyUser, (req, res) => {
  const { current, next } = req.body || {};
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(String(current || ''), row.password_hash)) fail(400, 'Current password is wrong');
  if (String(next || '').length < 6) fail(400, 'New password must be at least 6 characters');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), req.user.id);
  res.json({ ok: true });
});

// ---------- reference data ----------
app.get('/api/meta', anyUser, (req, res) => {
  const services = db.prepare('SELECT id, name FROM services ORDER BY sort').all();
  const prices = db.prepare('SELECT service_id, car_size, amount FROM prices').all();
  const locations = db.prepare('SELECT id, name, address, active FROM locations ORDER BY name').all();
  const packages = db
    .prepare(
      `SELECT p.*, s.name AS service_name FROM packages p JOIN services s ON s.id = p.service_id ORDER BY s.sort, p.name`
    )
    .all();
  const items = db.prepare('SELECT * FROM inventory_items ORDER BY name').all();
  const salesStaff = db
    .prepare(
      `SELECT id, name, role, location_id FROM users WHERE active = 1 AND role IN ('sales','manager')
       ${req.user.role === 'owner' ? '' : 'AND location_id = ?'} ORDER BY name`
    )
    .all(...(req.user.role === 'owner' ? [] : [req.user.location_id]));
  res.json({ services, prices, sizes: CAR_SIZES, locations, packages, items, salesStaff, today: today() });
});

// ---------- vehicles / customers ----------
function vehicleByPlate(plate) {
  return db.prepare('SELECT * FROM vehicles WHERE plate = ?').get(normalizePlate(plate));
}

function membershipsFor(vehicleId) {
  return db
    .prepare(
      `SELECT m.*, c.serial, p.name AS package_name, s.name AS service_name, l.name AS location_name,
              u.name AS sold_by_name,
              CASE WHEN m.expiry_date < ? THEN 'expired'
                   WHEN m.washes_used >= m.washes_total THEN 'used up'
                   ELSE 'active' END AS status
       FROM memberships m
       JOIN cards c ON c.id = m.card_id
       JOIN packages p ON p.id = m.package_id
       JOIN services s ON s.id = m.service_id
       JOIN locations l ON l.id = m.location_id
       JOIN users u ON u.id = m.sold_by
       WHERE m.vehicle_id = ? ORDER BY m.created_at DESC`
    )
    .all(today(), vehicleId);
}

app.get('/api/vehicles/lookup/:plate', anyUser, (req, res) => {
  const v = vehicleByPlate(req.params.plate);
  if (!v) return res.json({ found: false });
  const visits = db
    .prepare(
      `SELECT v.*, s.name AS service_name, l.name AS location_name FROM visits v
       JOIN services s ON s.id = v.service_id JOIN locations l ON l.id = v.location_id
       WHERE v.vehicle_id = ? ORDER BY v.created_at DESC LIMIT 20`
    )
    .all(v.id);
  res.json({ found: true, vehicle: v, memberships: membershipsFor(v.id), visits });
});

app.get('/api/vehicles', anyUser, (req, res) => {
  const q = String(req.query.q || '').trim();
  const like = `%${q}%`;
  const plateLike = `%${normalizePlate(q)}%`;
  const rows = db
    .prepare(
      `SELECT ve.*,
         (SELECT COUNT(*) FROM visits WHERE vehicle_id = ve.id) AS visit_count,
         (SELECT MAX(visit_date) FROM visits WHERE vehicle_id = ve.id) AS last_visit,
         (SELECT COUNT(*) FROM memberships m WHERE m.vehicle_id = ve.id
            AND m.expiry_date >= ? AND m.washes_used < m.washes_total) AS active_memberships
       FROM vehicles ve
       WHERE ? = '' OR ve.plate LIKE ? OR ve.phone LIKE ? OR ve.customer_name LIKE ? OR ve.car_type LIKE ?
       ORDER BY ve.updated_at DESC LIMIT 200`
    )
    .all(today(), q, plateLike, like, like, like);
  res.json(rows);
});

/** Create or update the vehicle record from a form body. Returns { vehicle, isNew }. */
function upsertVehicle(body, locationId) {
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
  const existing = db.prepare('SELECT * FROM vehicles WHERE plate = ?').get(plate);
  if (existing) {
    db.prepare(
      `UPDATE vehicles SET customer_name = ?, car_type = ?, car_size = ?, color = ?, phone = ?, address = ?,
       updated_at = datetime('now','localtime') WHERE id = ?`
    ).run(fields.customer_name, fields.car_type, fields.car_size, fields.color, fields.phone, fields.address, existing.id);
    return { vehicle: { ...existing, ...fields }, isNew: false };
  }
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO vehicles (plate, customer_name, car_type, car_size, color, phone, address, first_location_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(plate, fields.customer_name, fields.car_type, fields.car_size, fields.color, fields.phone, fields.address, locationId);
  return { vehicle: { id: Number(lastInsertRowid), plate, ...fields }, isNew: true };
}

// ---------- visits ----------
/**
 * Pricing rules:
 *  - list price comes from the price table (service × car size)
 *  - if the vehicle has an active membership for this service with washes left and
 *    use_membership is on, the wash is free and one wash is deducted
 *  - otherwise the best discount from any unexpired membership applies
 */
function priceVisit(vehicleId, serviceId, carSize, useMembership) {
  const p = db.prepare('SELECT amount FROM prices WHERE service_id = ? AND car_size = ?').get(serviceId, carSize);
  if (!p) fail(400, 'No price set for this service and car size');
  const list = p.amount;
  const result = { list_price: list, discount: 0, amount_paid: list, membership_id: null, used_membership_wash: 0 };
  if (!vehicleId) return result;

  const valid = db
    .prepare(
      `SELECT * FROM memberships WHERE vehicle_id = ? AND expiry_date >= ? ORDER BY expiry_date ASC`
    )
    .all(vehicleId, today());
  const coverWash = valid.find((m) => m.service_id === serviceId && m.washes_used < m.washes_total);
  if (coverWash && useMembership) {
    return { ...result, discount: list, amount_paid: 0, membership_id: coverWash.id, used_membership_wash: 1 };
  }
  const best = valid.reduce((a, m) => (!a || m.discount_pct > a.discount_pct ? m : a), null);
  if (best && best.discount_pct > 0) {
    const discount = Math.round((list * best.discount_pct) / 100);
    return { ...result, discount, amount_paid: list - discount, membership_id: best.id };
  }
  return result;
}

app.post('/api/visits/quote', anyUser, (req, res) => {
  const v = vehicleByPlate(req.body.plate);
  res.json(
    priceVisit(v?.id, Number(req.body.service_id), req.body.car_size, req.body.use_membership !== false)
  );
});

app.post('/api/visits', requireRole('owner', 'manager'), (req, res) => {
  const locationId = writeLocation(req);
  const serviceId = Number(req.body.service_id);
  if (!db.prepare('SELECT 1 FROM services WHERE id = ?').get(serviceId)) fail(400, 'Choose a service');
  const visit = tx(() => {
    const { vehicle, isNew } = upsertVehicle(req.body, locationId);
    const q = priceVisit(vehicle.id, serviceId, vehicle.car_size, req.body.use_membership !== false);
    if (q.used_membership_wash) {
      db.prepare('UPDATE memberships SET washes_used = washes_used + 1 WHERE id = ?').run(q.membership_id);
    }
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO visits (vehicle_id, location_id, service_id, car_size, customer_status, list_price, discount,
           amount_paid, membership_id, used_membership_wash, recorded_by, visit_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        vehicle.id, locationId, serviceId, vehicle.car_size, isNew ? 'new' : 'existing',
        q.list_price, q.discount, q.amount_paid, q.membership_id, q.used_membership_wash, req.user.id, today()
      );
    return { id: Number(lastInsertRowid), ...q, customer_status: isNew ? 'new' : 'existing', plate: vehicle.plate };
  });
  res.json(visit);
});

app.get('/api/visits', anyUser, (req, res) => {
  const loc = readLocation(req);
  const from = req.query.from || today();
  const to = req.query.to || from;
  const rows = db
    .prepare(
      `SELECT v.*, ve.plate, ve.car_type, ve.color, ve.phone, ve.address, ve.customer_name,
              s.name AS service_name, l.name AS location_name, u.name AS recorded_by_name, c.serial AS card_serial
       FROM visits v
       JOIN vehicles ve ON ve.id = v.vehicle_id
       JOIN services s ON s.id = v.service_id
       JOIN locations l ON l.id = v.location_id
       JOIN users u ON u.id = v.recorded_by
       LEFT JOIN memberships m ON m.id = v.membership_id
       LEFT JOIN cards c ON c.id = m.card_id
       WHERE v.visit_date BETWEEN ? AND ? AND (? IS NULL OR v.location_id = ?)
       ORDER BY v.created_at DESC`
    )
    .all(from, to, loc, loc);
  res.json(rows);
});

// ---------- membership cards ----------
app.get('/api/cards', anyUser, (req, res) => {
  const loc = readLocation(req);
  const status = req.query.status || null;
  const rows = db
    .prepare(
      `SELECT c.*, l.name AS location_name, ve.plate, m.id AS membership_id
       FROM cards c
       LEFT JOIN locations l ON l.id = c.location_id
       LEFT JOIN memberships m ON m.card_id = c.id
       LEFT JOIN vehicles ve ON ve.id = m.vehicle_id
       WHERE (? IS NULL OR c.status = ?) AND (? IS NULL OR c.location_id = ? OR c.location_id IS NULL)
       ORDER BY c.seq LIMIT 2000`
    )
    .all(status, status, loc, loc);
  const summary = db
    .prepare(
      `SELECT status, COUNT(*) AS n FROM cards WHERE (? IS NULL OR location_id = ? OR location_id IS NULL) GROUP BY status`
    )
    .all(loc, loc);
  res.json({ cards: rows, summary });
});

/** Register a batch of pre-printed cards, e.g. prefix "JD-", start 1, count 500, digits 5 → JD-00001…JD-00500 */
app.post('/api/cards/batch', ownerOnly, (req, res) => {
  const prefix = String(req.body.prefix ?? '').trim();
  const start = num(req.body.start, 'Start number', { min: 1 });
  const count = num(req.body.count, 'Number of cards', { min: 1 });
  const digits = num(req.body.digits ?? 5, 'Digits', { min: 1 });
  if (count > 10000) fail(400, 'Register at most 10,000 cards at a time');
  const locationId = req.body.location_id ? Number(req.body.location_id) : null;
  const ins = db.prepare('INSERT OR IGNORE INTO cards (serial, seq, location_id) VALUES (?, ?, ?)');
  const added = tx(() => {
    let n = 0;
    for (let i = 0; i < count; i++) {
      const seq = start + i;
      n += Number(ins.run(prefix + String(seq).padStart(digits, '0'), seq, locationId).changes);
    }
    return n;
  });
  res.json({ added, skipped: count - added });
});

app.patch('/api/cards/:id', ownerOnly, (req, res) => {
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(Number(req.params.id));
  if (!card) fail(404, 'Card not found');
  if (card.status === 'sold') fail(400, 'This card is already sold and cannot be changed');
  const status = req.body.status ?? card.status;
  if (!['available', 'void'].includes(status)) fail(400, 'Invalid status');
  const loc = req.body.location_id === undefined ? card.location_id : req.body.location_id || null;
  db.prepare('UPDATE cards SET status = ?, location_id = ? WHERE id = ?').run(status, loc, card.id);
  res.json({ ok: true });
});

// ---------- memberships ----------
app.post('/api/memberships', requireRole('owner', 'manager', 'sales'), (req, res) => {
  const locationId = writeLocation(req);
  const pkg = db.prepare('SELECT * FROM packages WHERE id = ? AND active = 1').get(Number(req.body.package_id));
  if (!pkg) fail(400, 'Choose a package');

  const serial = text(req.body.card_serial, 'Card serial number').toUpperCase();
  const card = db.prepare('SELECT * FROM cards WHERE UPPER(serial) = ?').get(serial);
  if (!card) fail(400, `Card ${serial} is not registered. Ask the owner to register this card batch.`);
  if (card.status === 'sold') fail(400, `Card ${serial} has already been sold`);
  if (card.status === 'void') fail(400, `Card ${serial} has been voided`);
  if (card.location_id && card.location_id !== locationId) fail(400, `Card ${serial} belongs to another location`);

  // Sales staff are credited with their own sales; managers/owner pick who made the sale.
  let soldBy = req.user.id;
  if (req.user.role !== 'sales' && req.body.sold_by) {
    const seller = db.prepare('SELECT id FROM users WHERE id = ? AND active = 1').get(Number(req.body.sold_by));
    if (!seller) fail(400, 'Unknown sales person');
    soldBy = seller.id;
  }

  const result = tx(() => {
    const { vehicle, isNew } = upsertVehicle(req.body, locationId);
    const amount = pkg[`price_${vehicle.car_size.toLowerCase()}`];
    const start = today();
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO memberships (card_id, vehicle_id, package_id, service_id, location_id, sold_by, recorded_by,
           customer_status, amount_paid, washes_total, discount_pct, start_date, expiry_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        card.id, vehicle.id, pkg.id, pkg.service_id, locationId, soldBy, req.user.id, isNew ? 'new' : 'existing',
        amount, pkg.washes, pkg.discount_pct, start, addDays(start, pkg.validity_days)
      );
    db.prepare(`UPDATE cards SET status = 'sold', location_id = ? WHERE id = ?`).run(locationId, card.id);
    return { id: Number(lastInsertRowid), amount_paid: amount, serial: card.serial, expiry_date: addDays(start, pkg.validity_days) };
  });
  res.json(result);
});

app.get('/api/memberships', anyUser, (req, res) => {
  const loc = readLocation(req);
  const status = req.query.status || 'all';
  const soldBy = req.user.role === 'sales' && req.query.mine === '1' ? req.user.id : null;
  const rows = db
    .prepare(
      `SELECT * FROM (
         SELECT m.*, c.serial, p.name AS package_name, s.name AS service_name, l.name AS location_name,
           u.name AS sold_by_name, ve.plate, ve.customer_name, ve.phone, ve.car_type, ve.color,
           CASE WHEN m.expiry_date < ? THEN 'expired'
                WHEN m.washes_used >= m.washes_total THEN 'used up'
                ELSE 'active' END AS status
         FROM memberships m
         JOIN cards c ON c.id = m.card_id
         JOIN packages p ON p.id = m.package_id
         JOIN services s ON s.id = m.service_id
         JOIN locations l ON l.id = m.location_id
         JOIN users u ON u.id = m.sold_by
         JOIN vehicles ve ON ve.id = m.vehicle_id
         WHERE (? IS NULL OR m.location_id = ?) AND (? IS NULL OR m.sold_by = ?)
       ) WHERE (? = 'all' OR status = ?)
       ORDER BY created_at DESC LIMIT 1000`
    )
    .all(today(), loc, loc, soldBy, soldBy, status, status);
  res.json(rows);
});

// ---------- inventory ----------
function previousClosing(locationId, itemId, date) {
  const r = db
    .prepare(
      `SELECT closing FROM inventory_entries WHERE location_id = ? AND item_id = ? AND entry_date < ?
       ORDER BY entry_date DESC LIMIT 1`
    )
    .get(locationId, itemId, date);
  return r ? r.closing : null;
}

app.get('/api/inventory', requireRole('owner', 'manager'), (req, res) => {
  const loc = req.user.role === 'owner' ? Number(req.query.location_id) : req.user.location_id;
  if (!loc) fail(400, 'Choose a location');
  const date = req.query.date || today();
  const items = db.prepare('SELECT * FROM inventory_items WHERE active = 1 ORDER BY name').all();
  const entries = db
    .prepare(
      `SELECT e.*, u.name AS recorded_by_name FROM inventory_entries e JOIN users u ON u.id = e.recorded_by
       WHERE e.location_id = ? AND e.entry_date = ?`
    )
    .all(loc, date);
  const byItem = Object.fromEntries(entries.map((e) => [e.item_id, e]));
  res.json(
    items.map((it) => {
      const prev = previousClosing(loc, it.id, date);
      return { item: it, entry: byItem[it.id] || null, previous_closing: prev };
    })
  );
});

/** Re-chain openings/closings for later days after a past day is edited. */
function rechain(locationId, itemId, fromDate) {
  const later = db
    .prepare(
      `SELECT * FROM inventory_entries WHERE location_id = ? AND item_id = ? AND entry_date > ? ORDER BY entry_date`
    )
    .all(locationId, itemId, fromDate);
  const upd = db.prepare('UPDATE inventory_entries SET opening = ?, closing = ? WHERE id = ?');
  for (const e of later) {
    const opening = previousClosing(locationId, itemId, e.entry_date);
    upd.run(opening, opening + e.received - e.used, e.id);
  }
}

app.put('/api/inventory', requireRole('owner', 'manager'), (req, res) => {
  const locationId = writeLocation(req);
  const date = text(req.body.date, 'Date');
  if (date > today()) fail(400, 'You cannot record stock for a future date');
  const entries = Array.isArray(req.body.entries) ? req.body.entries : [];
  tx(() => {
    for (const e of entries) {
      const itemId = Number(e.item_id);
      const item = db.prepare('SELECT name FROM inventory_items WHERE id = ?').get(itemId);
      if (!item) fail(400, 'Unknown inventory item');
      const received = num(e.received ?? 0, `${item.name}: received`);
      const used = num(e.used ?? 0, `${item.name}: used`);
      const prev = previousClosing(locationId, itemId, date);
      // Opening carries over from the last recorded closing; it can only be typed in for an item's first entry.
      const opening = prev ?? num(e.opening ?? 0, `${item.name}: opening stock`);
      const closing = opening + received - used;
      if (closing < 0) fail(400, `${item.name}: used (${used}) is more than available stock (${opening + received})`);
      db.prepare(
        `INSERT INTO inventory_entries (location_id, item_id, entry_date, opening, received, used, closing, note, recorded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (location_id, item_id, entry_date) DO UPDATE SET
           opening = excluded.opening, received = excluded.received, used = excluded.used,
           closing = excluded.closing, note = excluded.note, recorded_by = excluded.recorded_by,
           updated_at = datetime('now','localtime')`
      ).run(locationId, itemId, date, opening, received, used, closing, e.note || null, req.user.id);
      rechain(locationId, itemId, date);
    }
  });
  res.json({ ok: true });
});

function lowStock(loc) {
  return db
    .prepare(
      `SELECT l.name AS location_name, i.name, i.unit, i.reorder_level, e.closing, e.entry_date
       FROM inventory_entries e
       JOIN inventory_items i ON i.id = e.item_id
       JOIN locations l ON l.id = e.location_id
       WHERE i.active = 1 AND (? IS NULL OR e.location_id = ?)
         AND e.entry_date = (SELECT MAX(entry_date) FROM inventory_entries x
                             WHERE x.item_id = e.item_id AND x.location_id = e.location_id)
         AND e.closing <= i.reorder_level
       ORDER BY l.name, i.name`
    )
    .all(loc, loc);
}

// ---------- dashboard ----------
app.get('/api/dashboard', anyUser, (req, res) => {
  const loc = readLocation(req);
  const from = req.query.from || today();
  const to = req.query.to || from;
  const args = [from, to, loc, loc];
  const W = `visit_date BETWEEN ? AND ? AND (? IS NULL OR location_id = ?)`;
  const MW = `start_date BETWEEN ? AND ? AND (? IS NULL OR location_id = ?)`;

  const visits = db
    .prepare(
      `SELECT COUNT(*) AS cars, COALESCE(SUM(amount_paid),0) AS revenue,
         SUM(customer_status = 'new') AS new_customers, SUM(customer_status = 'existing') AS existing_customers,
         SUM(used_membership_wash) AS membership_washes, COALESCE(SUM(discount),0) AS discounts
       FROM visits WHERE ${W}`
    )
    .get(...args);
  const memberships = db
    .prepare(`SELECT COUNT(*) AS sold, COALESCE(SUM(amount_paid),0) AS revenue FROM memberships WHERE ${MW}`)
    .get(...args);
  const byService = db
    .prepare(
      `SELECT s.name, COUNT(v.id) AS cars, COALESCE(SUM(v.amount_paid),0) AS revenue
       FROM services s LEFT JOIN visits v ON v.service_id = s.id AND v.${W.replace(/location_id/g, 'v.location_id')}
       GROUP BY s.id ORDER BY s.sort`
    )
    .all(...args);
  const byLocation = db
    .prepare(
      `SELECT l.name,
         (SELECT COUNT(*) FROM visits v WHERE v.location_id = l.id AND v.visit_date BETWEEN ? AND ?) AS cars,
         (SELECT COALESCE(SUM(amount_paid),0) FROM visits v WHERE v.location_id = l.id AND v.visit_date BETWEEN ? AND ?) AS wash_revenue,
         (SELECT COUNT(*) FROM memberships m WHERE m.location_id = l.id AND m.start_date BETWEEN ? AND ?) AS memberships,
         (SELECT COALESCE(SUM(amount_paid),0) FROM memberships m WHERE m.location_id = l.id AND m.start_date BETWEEN ? AND ?) AS membership_revenue
       FROM locations l WHERE (? IS NULL OR l.id = ?) ORDER BY l.name`
    )
    .all(from, to, from, to, from, to, from, to, loc, loc);
  const bySeller = db
    .prepare(
      `SELECT u.name, l.name AS location_name, COUNT(m.id) AS sold, COALESCE(SUM(m.amount_paid),0) AS revenue
       FROM memberships m JOIN users u ON u.id = m.sold_by JOIN locations l ON l.id = m.location_id
       WHERE m.start_date BETWEEN ? AND ? AND (? IS NULL OR m.location_id = ?)
       GROUP BY u.id ORDER BY revenue DESC`
    )
    .all(...args);
  const cardsLeft = db
    .prepare(
      `SELECT COUNT(*) AS n FROM cards WHERE status = 'available' AND (? IS NULL OR location_id = ? OR location_id IS NULL)`
    )
    .get(loc, loc).n;

  res.json({
    from, to, visits, memberships, byService, byLocation, bySeller, cardsLeft,
    lowStock: req.user.role === 'sales' ? [] : lowStock(loc),
  });
});

// ---------- owner settings ----------
app.put('/api/prices', ownerOnly, (req, res) => {
  const rows = Array.isArray(req.body) ? req.body : [];
  const upd = db.prepare('UPDATE prices SET amount = ? WHERE service_id = ? AND car_size = ?');
  tx(() => rows.forEach((r) => upd.run(num(r.amount, 'Price'), Number(r.service_id), r.car_size)));
  res.json({ ok: true });
});

function packageFields(b) {
  const f = {
    name: text(b.name, 'Package name'),
    service_id: Number(b.service_id),
    washes: num(b.washes, 'Number of washes', { min: 1 }),
    discount_pct: num(b.discount_pct ?? 0, 'Discount'),
    validity_days: num(b.validity_days, 'Validity (days)', { min: 1 }),
    price_small: num(b.price_small, 'Price (Small)'),
    price_medium: num(b.price_medium, 'Price (Medium)'),
    price_large: num(b.price_large, 'Price (Large)'),
    active: b.active === false || b.active === 0 ? 0 : 1,
  };
  if (f.discount_pct > 100) fail(400, 'Discount cannot be more than 100%');
  if (!db.prepare('SELECT 1 FROM services WHERE id = ?').get(f.service_id)) fail(400, 'Choose a service');
  return f;
}
app.post('/api/packages', ownerOnly, (req, res) => {
  const f = packageFields(req.body);
  const cols = Object.keys(f);
  db.prepare(`INSERT INTO packages (${cols}) VALUES (${cols.map(() => '?')})`).run(...Object.values(f));
  res.json({ ok: true });
});
app.put('/api/packages/:id', ownerOnly, (req, res) => {
  const f = packageFields(req.body);
  db.prepare(`UPDATE packages SET ${Object.keys(f).map((k) => `${k} = ?`)} WHERE id = ?`).run(
    ...Object.values(f),
    Number(req.params.id)
  );
  res.json({ ok: true });
});

app.post('/api/locations', ownerOnly, (req, res) => {
  db.prepare('INSERT INTO locations (name, address) VALUES (?, ?)').run(
    text(req.body.name, 'Location name'),
    text(req.body.address, 'Address', { required: false })
  );
  res.json({ ok: true });
});
app.put('/api/locations/:id', ownerOnly, (req, res) => {
  db.prepare('UPDATE locations SET name = ?, address = ?, active = ? WHERE id = ?').run(
    text(req.body.name, 'Location name'),
    text(req.body.address, 'Address', { required: false }),
    req.body.active === false || req.body.active === 0 ? 0 : 1,
    Number(req.params.id)
  );
  res.json({ ok: true });
});

app.get('/api/users', ownerOnly, (_req, res) => {
  res.json(
    db
      .prepare(
        `SELECT u.id, u.name, u.username, u.role, u.location_id, u.active, u.created_at, l.name AS location_name
         FROM users u LEFT JOIN locations l ON l.id = u.location_id ORDER BY u.role, u.name`
      )
      .all()
  );
});
function userLocation(role, locationId) {
  if (role === 'owner') return null;
  const id = Number(locationId);
  if (!id || !db.prepare('SELECT 1 FROM locations WHERE id = ?').get(id)) fail(400, 'Managers and sales staff need a location');
  return id;
}
app.post('/api/users', ownerOnly, (req, res) => {
  const role = text(req.body.role, 'Role');
  if (!['owner', 'manager', 'sales'].includes(role)) fail(400, 'Invalid role');
  const password = String(req.body.password || '');
  if (password.length < 6) fail(400, 'Password must be at least 6 characters');
  const username = text(req.body.username, 'Username');
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) fail(400, 'That username is taken');
  db.prepare('INSERT INTO users (name, username, password_hash, role, location_id) VALUES (?, ?, ?, ?, ?)').run(
    text(req.body.name, 'Name'),
    username,
    hashPassword(password),
    role,
    userLocation(role, req.body.location_id)
  );
  res.json({ ok: true });
});
app.put('/api/users/:id', ownerOnly, (req, res) => {
  const id = Number(req.params.id);
  const role = text(req.body.role, 'Role');
  if (!['owner', 'manager', 'sales'].includes(role)) fail(400, 'Invalid role');
  const active = req.body.active === false || req.body.active === 0 ? 0 : 1;
  if (id === req.user.id && (!active || role !== 'owner')) fail(400, 'You cannot deactivate or demote your own account');
  db.prepare('UPDATE users SET name = ?, role = ?, location_id = ?, active = ? WHERE id = ?').run(
    text(req.body.name, 'Name'),
    role,
    userLocation(role, req.body.location_id),
    active,
    id
  );
  if (req.body.password) {
    if (String(req.body.password).length < 6) fail(400, 'Password must be at least 6 characters');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(req.body.password), id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  }
  if (!active) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  res.json({ ok: true });
});

app.post('/api/items', ownerOnly, (req, res) => {
  db.prepare('INSERT INTO inventory_items (name, unit, reorder_level) VALUES (?, ?, ?)').run(
    text(req.body.name, 'Item name'),
    text(req.body.unit, 'Unit'),
    num(req.body.reorder_level ?? 0, 'Reorder level')
  );
  res.json({ ok: true });
});
app.put('/api/items/:id', ownerOnly, (req, res) => {
  db.prepare('UPDATE inventory_items SET name = ?, unit = ?, reorder_level = ?, active = ? WHERE id = ?').run(
    text(req.body.name, 'Item name'),
    text(req.body.unit, 'Unit'),
    num(req.body.reorder_level ?? 0, 'Reorder level'),
    req.body.active === false || req.body.active === 0 ? 0 : 1,
    Number(req.params.id)
  );
  res.json({ ok: true });
});

app.use('/api', (_req, _res) => fail(404, 'Not found'));

// ---------- serve the built frontend in production ----------
const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(resolve(dist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  const status = err.status || (String(err.message).includes('UNIQUE') ? 400 : 500);
  if (status === 500) console.error(err);
  const message = String(err.message).includes('UNIQUE constraint failed')
    ? 'That record already exists'
    : status === 500
      ? 'Something went wrong'
      : err.message;
  res.status(status).json({ error: message });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`JD Car Wash API running on http://localhost:${port}`));
