import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useSession } from './session';
import { ROLE_LABEL } from './api';

const NAV = [
  { to: '/', label: 'Dashboard', roles: ['owner', 'manager', 'sales'], end: true },
  { to: '/visits/new', label: 'Record a car', roles: ['owner', 'manager'] },
  { to: '/visits', label: 'Car log', roles: ['owner', 'manager'], end: true },
  { to: '/customers', label: 'Customers', roles: ['owner', 'manager', 'sales'] },
  { to: '/memberships/new', label: 'Sell membership', roles: ['owner', 'manager', 'sales'] },
  { to: '/memberships', label: 'Memberships', roles: ['owner', 'manager', 'sales'], end: true },
  { to: '/inventory', label: 'Daily inventory', roles: ['owner', 'manager'] },
  { section: 'Owner settings', roles: ['owner'] },
  { to: '/cards', label: 'Membership cards', roles: ['owner'] },
  { to: '/settings/prices', label: 'Service prices', roles: ['owner'] },
  { to: '/settings/packages', label: 'Packages', roles: ['owner'] },
  { to: '/settings/staff', label: 'Staff & logins', roles: ['owner'] },
  { to: '/settings/locations', label: 'Locations', roles: ['owner'] },
  { to: '/settings/items', label: 'Inventory items', roles: ['owner'] },
];

export default function Layout() {
  const { user, meta, logout, isOwner, locationId, chooseLocation } = useSession();
  const [open, setOpen] = useState(false);
  const links = NAV.filter((n) => n.roles.includes(user.role));

  const sidebar = (
    <nav className="flex flex-col gap-0.5 p-3">
      {links.map((n) =>
        n.section ? (
          <div key={n.section} className="mt-5 mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-brand-200/70">
            {n.section}
          </div>
        ) : (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-white/15 text-white' : 'text-brand-100 hover:bg-white/10'}`
            }
          >
            {n.label}
          </NavLink>
        )
      )}
    </nav>
  );

  return (
    <div className="min-h-screen lg:flex">
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 transform bg-brand-900 transition-transform lg:static lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="border-b border-white/10 px-5 py-5">
          <div className="text-lg font-bold leading-tight text-white">JD Car Wash</div>
          <div className="text-xs text-brand-200">& Detailing Services</div>
        </div>
        {sidebar}
      </aside>
      {open && <div className="fixed inset-0 z-20 bg-black/30 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
          <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Menu">
            ☰
          </button>
          <div className="flex-1">
            {isOwner ? (
              <select
                value={locationId}
                onChange={(e) => chooseLocation(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium"
              >
                <option value="">All locations</option>
                {meta.locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-sm font-medium text-slate-700">{user.location_name}</span>
            )}
          </div>
          <div className="text-right text-sm leading-tight">
            <NavLink to="/account" className="font-medium text-slate-800 hover:underline">
              {user.name}
            </NavLink>
            <div className="text-xs text-slate-500">{ROLE_LABEL[user.role]}</div>
          </div>
          <button onClick={logout} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
            Log out
          </button>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
