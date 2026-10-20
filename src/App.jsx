import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { SessionProvider, useSession } from './session';
import Layout from './Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import NewVisit from './pages/NewVisit';
import Visits from './pages/Visits';
import Customers from './pages/Customers';
import CustomerDetail from './pages/CustomerDetail';
import NewMembership from './pages/NewMembership';
import Memberships from './pages/Memberships';
import Inventory from './pages/Inventory';
import Cards from './pages/Cards';
import Prices from './pages/settings/Prices';
import Packages from './pages/settings/Packages';
import Staff from './pages/settings/Staff';
import Locations from './pages/settings/Locations';
import Items from './pages/settings/Items';
import Account from './pages/Account';

function Guard({ roles, children }) {
  const { user } = useSession();
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  const { user, meta } = useSession();
  if (user === undefined || (user && !meta)) {
    return <div className="grid min-h-screen place-items-center text-slate-500">Loading…</div>;
  }
  if (!user) return <Login />;

  const OM = ['owner', 'manager'];
  const ALL = ['owner', 'manager', 'sales'];
  const O = ['owner'];
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="visits/new" element={<Guard roles={OM}><NewVisit /></Guard>} />
        <Route path="visits" element={<Guard roles={OM}><Visits /></Guard>} />
        <Route path="customers" element={<Guard roles={ALL}><Customers /></Guard>} />
        <Route path="customers/:plate" element={<Guard roles={ALL}><CustomerDetail /></Guard>} />
        <Route path="memberships/new" element={<Guard roles={ALL}><NewMembership /></Guard>} />
        <Route path="memberships" element={<Guard roles={ALL}><Memberships /></Guard>} />
        <Route path="inventory" element={<Guard roles={OM}><Inventory /></Guard>} />
        <Route path="cards" element={<Guard roles={O}><Cards /></Guard>} />
        <Route path="settings/prices" element={<Guard roles={O}><Prices /></Guard>} />
        <Route path="settings/packages" element={<Guard roles={O}><Packages /></Guard>} />
        <Route path="settings/staff" element={<Guard roles={O}><Staff /></Guard>} />
        <Route path="settings/locations" element={<Guard roles={O}><Locations /></Guard>} />
        <Route path="settings/items" element={<Guard roles={O}><Items /></Guard>} />
        <Route path="account" element={<Account />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <AppRoutes />
      </SessionProvider>
    </BrowserRouter>
  );
}
