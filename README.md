# JD Car Wash & Detailing — Management System

React + Vite frontend, Express API, SQLite database (Node's built-in `node:sqlite`, so no native build step). Needs Node 22.13+.

## Run it

```bash
npm install
npm run dev        # web on http://localhost:5180, API on :4000
```

Production (one process serves both the API and the built site):

```bash
npm run build
PORT=8080 npm start
```

The database file is `data/jdcarwash.db` (override with `DB_PATH`). Back this file up regularly.
To start completely fresh, stop the server and delete the `data/` folder.

## First login

| Account | Username | Password |
|---|---|---|
| Owner (created on first run) | `admin` | `changeme123` (or set `ADMIN_PASSWORD` before first run) |

Change it straight away under **your name → Change password**.

Demo accounts added during development (delete `data/` to remove them, or disable them under Staff & logins):
`aisha` / `secret1` (Manager, Main Branch) and `musa` / `secret1` (Sales, Main Branch).

## Owner setup checklist

1. **Locations** — add each branch.
2. **Staff & logins** — one Manager and the Sales/Marketing team per location.
3. **Service prices** — price for each of the 6 services × Small / Medium / Large (seeded with placeholders).
4. **Packages** — e.g. "Premium Monthly": 4 Premium washes, 15% off other services, valid 30 days, priced by car size.
5. **Membership cards** — register each printed batch (prefix + first number + count, e.g. `JD-00001`…`JD-00500`), optionally tied to a location.
6. **Inventory items** — the stock each location counts daily, with a reorder level.

## Roles

| | Owner | Manager | Sales / Marketing |
|---|---|---|---|
| Dashboard | all locations | own location | own location |
| Record a car / car log | ✓ | ✓ | |
| Sell membership | ✓ (picks seller) | ✓ (picks seller) | ✓ (credited to self) |
| Customers & memberships | ✓ | ✓ | ✓ |
| Daily inventory | ✓ | ✓ | |
| Prices, packages, cards, staff, locations, items | ✓ | | |

## Business rules

- **Plate number** is the unique customer key. Typing a known plate fills in the rest and marks the visit *existing*; an unknown plate creates a *new* customer.
- **Price** = price table (service × car size).
- **Membership**: while the card is valid, a wash of the package's service uses up one prepaid wash (₦0, can be unticked). Any other service, or the same service once the washes run out, gets the package discount. Cards stop working after the expiry date.
- **Cards** can be sold once. Unsold cards can be voided or restored; sold cards are locked.
- **Inventory**: closing = opening + received − used. Opening carries over from the last recorded day. Editing a past day recalculates all later days. Low-stock alerts appear on the dashboard.
