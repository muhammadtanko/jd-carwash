import { Link, useParams } from 'react-router-dom';
import { api, formatMoney } from '../api';
import { useSession } from '../session';
import { Alert, Badge, Button, Card, PageHeader, Table, statusColor, useFetch } from '../ui';

export default function CustomerDetail() {
  const { plate } = useParams();
  const { user } = useSession();
  const { data, error, loading } = useFetch(() => api(`/vehicles/lookup/${encodeURIComponent(plate)}`), [plate]);

  if (loading && !data) return <p className="text-slate-500">Loading…</p>;
  if (error) return <Alert>{error}</Alert>;
  if (!data.found) return <Alert kind="warn">No customer with plate {plate}.</Alert>;
  const { vehicle: v, memberships, visits } = data;

  return (
    <>
      <PageHeader
        title={<span className="font-mono">{v.plate}</span>}
        subtitle={`${v.car_type} · ${v.color} · ${v.car_size}`}
        actions={
          <>
            {user.role !== 'sales' && (
              <Link to="/visits/new">
                <Button>Record a car</Button>
              </Link>
            )}
            <Link to="/memberships/new">
              <Button variant="secondary">Sell membership</Button>
            </Link>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Customer">
          <dl className="space-y-2 text-sm">
            {[
              ['Name', v.customer_name || '—'],
              ['Phone', <a key="p" href={`tel:${v.phone}`} className="text-brand-700 hover:underline">{v.phone}</a>],
              ['Address', v.address || '—'],
              ['First seen', v.created_at.slice(0, 10)],
            ].map(([k, val]) => (
              <div key={k}>
                <dt className="text-xs uppercase tracking-wide text-slate-500">{k}</dt>
                <dd>{val}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card title="Membership cards" className="lg:col-span-2">
          <Table
            rows={memberships}
            empty="No membership"
            columns={[
              { key: 'serial', label: 'Card', render: (r) => <span className="font-mono">{r.serial}</span> },
              { key: 'package_name', label: 'Package', render: (r) => `${r.package_name} (${r.service_name})` },
              { key: 'left', label: 'Washes left', right: true, render: (r) => `${r.washes_total - r.washes_used} / ${r.washes_total}` },
              { key: 'discount_pct', label: 'Discount', right: true, render: (r) => `${r.discount_pct}%` },
              { key: 'expiry_date', label: 'Expires' },
              { key: 'status', label: 'Status', render: (r) => <Badge color={statusColor(r.status)}>{r.status}</Badge> },
              { key: 'sold_by_name', label: 'Sold by' },
            ]}
          />
        </Card>
      </div>
      <Card title="Recent visits" className="mt-6">
        <Table
          rows={visits}
          empty="No visits yet"
          columns={[
            { key: 'visit_date', label: 'Date' },
            { key: 'service_name', label: 'Service' },
            { key: 'location_name', label: 'Location' },
            { key: 'list_price', label: 'Price', right: true, render: (r) => formatMoney(r.list_price) },
            { key: 'amount_paid', label: 'Paid', right: true, render: (r) => formatMoney(r.amount_paid) },
            { key: 'm', label: '', render: (r) => (r.used_membership_wash ? <Badge color="green">Membership wash</Badge> : r.discount > 0 ? <Badge color="blue">Member discount</Badge> : '') },
          ]}
        />
      </Card>
    </>
  );
}
