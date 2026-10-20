import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatMoney, qs } from '../api';
import { useSession } from '../session';
import { Alert, Button, Card, PageHeader, Stat, Table, useFetch } from '../ui';
import DateRange from '../components/DateRange';

export default function Dashboard() {
  const { meta, user, locationId, isOwner } = useSession();
  const [range, setRange] = useState({ from: meta.today, to: meta.today });
  const { data, error } = useFetch(
    () => api(`/dashboard${qs({ ...range, location_id: locationId })}`),
    [range.from, range.to, locationId]
  );

  const greeting = `Welcome, ${user.name.split(' ')[0]}`;
  const actions =
    user.role === 'sales' ? (
      <Link to="/memberships/new">
        <Button>Sell membership</Button>
      </Link>
    ) : (
      <>
        <Link to="/inventory">
          <Button variant="secondary">Daily inventory</Button>
        </Link>
        <Link to="/visits/new">
          <Button>Record a car</Button>
        </Link>
      </>
    );

  return (
    <>
      <PageHeader title={greeting} actions={actions} />
      <div className="mb-5">
        <DateRange value={range} onChange={setRange} today={meta.today} />
      </div>
      <Alert>{error}</Alert>
      {isOwner && meta.packages.length === 0 && (
        <div className="mb-4">
          <Alert kind="warn">
            Getting started: check the <Link className="underline" to="/settings/prices">service prices</Link>, add{' '}
            <Link className="underline" to="/settings/packages">membership packages</Link>, register your{' '}
            <Link className="underline" to="/cards">printed cards</Link>, and create{' '}
            <Link className="underline" to="/settings/staff">staff logins</Link>.
          </Alert>
        </div>
      )}
      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Cars washed" value={data.visits.cars} sub={`${data.visits.new_customers || 0} new · ${data.visits.existing_customers || 0} existing`} />
            <Stat label="Wash revenue" value={formatMoney(data.visits.revenue)} sub={`${data.visits.membership_washes || 0} paid with membership`} />
            <Stat label="Memberships sold" value={data.memberships.sold} sub={formatMoney(data.memberships.revenue)} />
            <Stat
              label="Total collected"
              value={formatMoney(data.visits.revenue + data.memberships.revenue)}
              sub={`${data.cardsLeft} unsold cards left`}
            />
          </div>

          {data.lowStock.length > 0 && (
            <Alert kind="warn">
              <div className="mb-1 font-medium">Low stock</div>
              <ul className="list-inside list-disc">
                {data.lowStock.map((s) => (
                  <li key={s.location_name + s.name}>
                    {s.name}: {s.closing} {s.unit} left (reorder at {s.reorder_level})
                    {isOwner && !locationId && ` — ${s.location_name}`}
                  </li>
                ))}
              </ul>
            </Alert>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="By service">
              <ServiceBars rows={data.byService} />
            </Card>
            <Card title="Membership sales by staff">
              <Table
                rowKey={(r) => r.name + r.location_name}
                rows={data.bySeller}
                empty="No memberships sold in this period"
                columns={[
                  { key: 'name', label: 'Sold by' },
                  ...(isOwner && !locationId ? [{ key: 'location_name', label: 'Location' }] : []),
                  { key: 'sold', label: 'Cards', right: true },
                  { key: 'revenue', label: 'Amount', right: true, render: (r) => formatMoney(r.revenue) },
                ]}
              />
            </Card>
          </div>

          {isOwner && !locationId && (
            <Card title="By location">
              <Table
                rowKey={(r) => r.name}
                rows={data.byLocation}
                columns={[
                  { key: 'name', label: 'Location' },
                  { key: 'cars', label: 'Cars', right: true },
                  { key: 'wash_revenue', label: 'Wash revenue', right: true, render: (r) => formatMoney(r.wash_revenue) },
                  { key: 'memberships', label: 'Memberships', right: true },
                  { key: 'membership_revenue', label: 'Membership revenue', right: true, render: (r) => formatMoney(r.membership_revenue) },
                  { key: 'total', label: 'Total', right: true, render: (r) => <strong>{formatMoney(r.wash_revenue + r.membership_revenue)}</strong> },
                ]}
              />
            </Card>
          )}
        </div>
      )}
    </>
  );
}

function ServiceBars({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.cars));
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.name} className="text-sm">
          <div className="mb-1 flex justify-between">
            <span className="font-medium">{r.name}</span>
            <span className="tabular-nums text-slate-500">
              {r.cars} car{r.cars === 1 ? '' : 's'} · {formatMoney(r.revenue)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-brand-500" style={{ width: `${(r.cars / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
