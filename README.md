# JD Car Wash & Detailing — Management System (front-end demo)

A React + Vite single-page app. There is **no server**: all data is created and stored in the browser
(`localStorage`), so it can be deployed to any static host (Vercel, Netlify, GitHub Pages…).

> Each browser keeps its own copy of the data. Staff on different phones/computers will **not** see each
> other's records. This version is for viewing and demoing the system; running the real business across
> branches needs a shared backend again.

## Run it

```bash
npm install
npm run dev        # http://localhost:5180
```

## Deploy

```bash
npm run build      # outputs dist/
```

- **Vercel**: framework preset *Vite*, build `npm run build`, output `dist`. `vercel.json` sends every route to `index.html`.
- **Netlify**: same build settings; `public/_redirects` handles routes.

## Signing in

The login page has one-click **Try the demo as Owner / Manager / Sales** buttons.

Username/password sign-in also works for the demo accounts:

| Role | Username | Password | Location |
|---|---|---|---|
| Owner | `admin` | `changeme123` | All |
| Manager | `aisha` | `secret1` | Main Branch |
| Sales | `musa` | `secret1` | Main Branch |
| Manager | `sani` | `secret1` | Barnawa Branch |
| Sales | `grace` | `secret1` | Barnawa Branch |

The first visit loads sample data: 2 branches, 24 customers, two weeks of car visits, memberships, 300 cards and a
week of inventory. To start again, sign in as Owner → your name (top right) → **Reset demo data**.

Passwords are only hashed in the browser. That is fine for a demo but is not real security.

## Code layout

- `src/backend/` — the in-browser "server": `store.js` (localStorage + sample data) and `routes.js`
  (the same endpoints the old Express API had, e.g. `POST /visits`, `GET /dashboard`).
- `src/api.js` — `api(path, { method, body })`, which every page calls. To move back to a real server later,
  point this function at `fetch('/api' + path)` again; the pages need no changes.

## Business rules

- **Plate number** is the unique customer key. Typing a known plate fills in the rest and marks the visit *existing*.
- **Price** = price table (service × Small / Medium / Large).
- **Membership**: while the card is valid, a wash of the package's service uses one prepaid wash (₦0, can be
  unticked). Any other service, or the same service once washes run out, gets the package discount.
- **Cards** are pre-printed serials registered in batches; each can be sold once. Unsold cards can be voided.
- **Inventory**: closing = opening + received − used. Opening carries over from the previous recorded day, and
  editing a past day recalculates later days. Low-stock alerts appear on the dashboard.
