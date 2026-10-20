import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../api';
import { Alert, Badge, Card, Input, PageHeader, Table, useFetch } from '../ui';

export default function Customers() {
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setTerm(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  const { data, error, loading } = useFetch(() => api(`/vehicles${qs({ q: term })}`), [term]);

  const columns = [
    {
      key: 'plate',
      label: 'Plate',
      render: (r) => (
        <Link to={`/customers/${r.plate}`} className="font-mono font-medium text-brand-700 hover:underline">
          {r.plate}
        </Link>
      ),
    },
    { key: 'customer_name', label: 'Name', render: (r) => r.customer_name || '—' },
    { key: 'phone', label: 'Phone' },
    { key: 'car', label: 'Car', render: (r) => `${r.car_type} · ${r.color}` },
    { key: 'car_size', label: 'Size' },
    { key: 'address', label: 'Address', render: (r) => r.address || '—' },
    { key: 'visit_count', label: 'Visits', right: true },
    { key: 'last_visit', label: 'Last visit', render: (r) => r.last_visit || '—' },
    {
      key: 'member',
      label: 'Member',
      render: (r) => (r.active_memberships > 0 ? <Badge color="green">Active</Badge> : ''),
    },
  ];

  return (
    <>
      <PageHeader title="Customers" subtitle="Every vehicle that has visited or bought a membership, across all locations." />
      <div className="mb-4 max-w-sm">
        <Input placeholder="Search by plate, phone, name or car" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      <Alert>{error}</Alert>
      <Card>
        {loading && !data ? (
          <p className="text-slate-500">Loading…</p>
        ) : (
          <Table columns={columns} rows={data || []} empty={term ? 'No customer matches that search' : 'No customers yet'} />
        )}
      </Card>
    </>
  );
}
