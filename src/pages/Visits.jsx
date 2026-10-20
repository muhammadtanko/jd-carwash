import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatMoney, qs } from '../api';
import { useSession } from '../session';
import { Alert, Badge, Button, Card, PageHeader, Table, statusColor, useFetch } from '../ui';
import DateRange from '../components/DateRange';
import { downloadCsv } from '../csv';

export default function Visits() {
  const { meta, locationId, isOwner } = useSession();
  const [range, setRange] = useState({ from: meta.today, to: meta.today });
  const { data, error, loading } = useFetch(
    () => api(`/visits${qs({ ...range, location_id: locationId })}`),
    [range.from, range.to, locationId]
  );
  const rows = data || [];
  const total = rows.reduce((s, r) => s + r.amount_paid, 0);

  const columns = [
    { key: 'time', label: 'Time', render: (r) => (range.from === range.to ? r.created_at.slice(11, 16) : r.created_at.slice(0, 16)) },
    {
      key: 'plate',
      label: 'Plate',
      render: (r) => (
        <Link to={`/customers/${r.plate}`} className="font-mono font-medium text-brand-700 hover:underline">
          {r.plate}
        </Link>
      ),
    },
    { key: 'car', label: 'Car', render: (r) => `${r.car_type} · ${r.color} · ${r.car_size}` },
    { key: 'service_name', label: 'Service' },
    { key: 'status', label: 'Customer', render: (r) => <Badge color={statusColor(r.customer_status)}>{r.customer_status}</Badge> },
    { key: 'phone', label: 'Phone' },
    {
      key: 'member',
      label: 'Membership',
      render: (r) =>
        r.card_serial ? (
          <span className="text-xs">
            <span className="font-mono">{r.card_serial}</span> {r.used_membership_wash ? '(wash used)' : '(discount)'}
          </span>
        ) : (
          '—'
        ),
    },
    { key: 'list_price', label: 'Price', right: true, render: (r) => formatMoney(r.list_price) },
    { key: 'amount_paid', label: 'Paid', right: true, render: (r) => formatMoney(r.amount_paid) },
    ...(isOwner && !locationId ? [{ key: 'location_name', label: 'Location' }] : []),
    { key: 'recorded_by_name', label: 'By' },
  ];

  const exportCsv = () =>
    downloadCsv(`car-log-${range.from}_to_${range.to}.csv`, rows, [
      ['Date/time', (r) => r.created_at],
      ['Plate', (r) => r.plate],
      ['Car type', (r) => r.car_type],
      ['Colour', (r) => r.color],
      ['Size', (r) => r.car_size],
      ['Service', (r) => r.service_name],
      ['New/Existing', (r) => r.customer_status],
      ['Phone', (r) => r.phone],
      ['Address', (r) => r.address],
      ['Card', (r) => r.card_serial],
      ['Price', (r) => r.list_price],
      ['Discount', (r) => r.discount],
      ['Paid', (r) => r.amount_paid],
      ['Location', (r) => r.location_name],
      ['Recorded by', (r) => r.recorded_by_name],
    ]);

  return (
    <>
      <PageHeader
        title="Car log"
        subtitle={`${rows.length} car${rows.length === 1 ? '' : 's'} · ${formatMoney(total)} collected`}
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv} disabled={!rows.length}>
              Export CSV
            </Button>
            <Link to="/visits/new">
              <Button>Record a car</Button>
            </Link>
          </>
        }
      />
      <div className="mb-4">
        <DateRange value={range} onChange={setRange} today={meta.today} />
      </div>
      <Alert>{error}</Alert>
      <Card>{loading && !data ? <p className="text-slate-500">Loading…</p> : <Table columns={columns} rows={rows} empty="No cars recorded for this period" />}</Card>
    </>
  );
}
