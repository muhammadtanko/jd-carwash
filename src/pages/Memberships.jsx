import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatMoney, qs } from '../api';
import { useSession } from '../session';
import { Alert, Badge, Button, Card, Input, PageHeader, Table, statusColor, useFetch } from '../ui';
import { downloadCsv } from '../csv';

export default function Memberships() {
  const { user, locationId, isOwner } = useSession();
  const [status, setStatus] = useState('active');
  const [mine, setMine] = useState(user.role === 'sales');
  const [q, setQ] = useState('');
  const { data, error, loading } = useFetch(
    () => api(`/memberships${qs({ status, location_id: locationId, mine: mine ? '1' : '' })}`),
    [status, locationId, mine]
  );
  const term = q.trim().toUpperCase();
  const rows = (data || []).filter(
    (r) =>
      !term ||
      r.plate.includes(term.replace(/[^A-Z0-9]/g, '')) ||
      r.serial.toUpperCase().includes(term) ||
      (r.phone || '').includes(term) ||
      (r.customer_name || '').toUpperCase().includes(term)
  );

  const columns = [
    { key: 'serial', label: 'Card', render: (r) => <span className="font-mono">{r.serial}</span> },
    {
      key: 'plate',
      label: 'Plate',
      render: (r) => (
        <Link to={`/customers/${r.plate}`} className="font-mono font-medium text-brand-700 hover:underline">
          {r.plate}
        </Link>
      ),
    },
    { key: 'customer', label: 'Customer', render: (r) => r.customer_name || r.phone },
    { key: 'package', label: 'Package', render: (r) => `${r.package_name} (${r.service_name})` },
    { key: 'washes', label: 'Washes left', right: true, render: (r) => `${r.washes_total - r.washes_used} / ${r.washes_total}` },
    { key: 'discount_pct', label: 'Discount', right: true, render: (r) => `${r.discount_pct}%` },
    { key: 'start_date', label: 'Sold' },
    { key: 'expiry_date', label: 'Expires' },
    { key: 'status', label: 'Status', render: (r) => <Badge color={statusColor(r.status)}>{r.status}</Badge> },
    { key: 'amount_paid', label: 'Paid', right: true, render: (r) => formatMoney(r.amount_paid) },
    { key: 'sold_by_name', label: 'Sold by' },
    ...(isOwner && !locationId ? [{ key: 'location_name', label: 'Location' }] : []),
  ];

  const exportCsv = () =>
    downloadCsv('memberships.csv', rows, [
      ['Card', (r) => r.serial],
      ['Plate', (r) => r.plate],
      ['Customer', (r) => r.customer_name],
      ['Phone', (r) => r.phone],
      ['Car', (r) => `${r.car_type} ${r.color}`],
      ['Package', (r) => r.package_name],
      ['Service', (r) => r.service_name],
      ['Washes used', (r) => r.washes_used],
      ['Washes total', (r) => r.washes_total],
      ['Discount %', (r) => r.discount_pct],
      ['Sold', (r) => r.start_date],
      ['Expires', (r) => r.expiry_date],
      ['Status', (r) => r.status],
      ['Paid', (r) => r.amount_paid],
      ['Sold by', (r) => r.sold_by_name],
      ['Location', (r) => r.location_name],
    ]);

  return (
    <>
      <PageHeader
        title="Memberships"
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv} disabled={!rows.length}>
              Export CSV
            </Button>
            <Link to="/memberships/new">
              <Button>Sell membership</Button>
            </Link>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
          {['active', 'used up', 'expired', 'all'].map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-md px-3 py-1 capitalize ${status === s ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {s}
            </button>
          ))}
        </div>
        {user.role === 'sales' && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Only my sales
          </label>
        )}
        <div className="w-64">
          <Input placeholder="Search plate, card, phone, name" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <Alert>{error}</Alert>
      <Card>{loading && !data ? <p className="text-slate-500">Loading…</p> : <Table columns={columns} rows={rows} empty="No memberships found" />}</Card>
    </>
  );
}
