import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatMoney } from '../api';
import { useSession } from '../session';
import { Alert, Button, Card, PageHeader } from '../ui';
import VehicleForm, { LocationPicker, emptyVehicle } from '../components/VehicleForm';

export default function NewVisit() {
  const { meta, locationId } = useSession();
  const [vehicle, setVehicle] = useState(emptyVehicle);
  const [lookup, setLookup] = useState(null);
  const [serviceId, setServiceId] = useState('');
  const [useMembership, setUseMembership] = useState(true);
  const [loc, setLoc] = useState(locationId);
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);

  const coveringMembership =
    lookup?.found &&
    lookup.memberships.find((m) => m.status === 'active' && String(m.service_id) === String(serviceId));

  useEffect(() => {
    if (!serviceId || !vehicle.car_size) return setQuote(null);
    let cancelled = false;
    api('/visits/quote', {
      method: 'POST',
      body: { plate: vehicle.plate, service_id: serviceId, car_size: vehicle.car_size, use_membership: useMembership },
    })
      .then((q) => !cancelled && setQuote(q))
      .catch(() => !cancelled && setQuote(null));
    return () => {
      cancelled = true;
    };
  }, [serviceId, vehicle.car_size, vehicle.plate, useMembership, lookup]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api('/visits', {
        method: 'POST',
        body: { ...vehicle, service_id: serviceId, use_membership: useMembership, location_id: loc },
      });
      setDone(r);
      setVehicle(emptyVehicle);
      setLookup(null);
      setServiceId('');
      setUseMembership(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const serviceName = (id) => meta.services.find((s) => String(s.id) === String(id))?.name;

  return (
    <>
      <PageHeader title="Record a car" subtitle="Enter the plate number first. Returning customers are filled in automatically." />
      <div className="mb-4 space-y-3">
        {done && (
          <Alert kind="success">
            Saved <span className="font-mono font-semibold">{done.plate}</span> ({done.customer_status} customer) —{' '}
            {done.used_membership_wash ? (
              <>membership wash used, nothing to pay.</>
            ) : (
              <>
                collect <strong>{formatMoney(done.amount_paid)}</strong>
                {done.discount > 0 && <> (member discount {formatMoney(done.discount)})</>}.
              </>
            )}{' '}
            <Link to="/visits" className="underline">
              View today's log
            </Link>
          </Alert>
        )}
        <Alert>{error}</Alert>
      </div>

      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-3">
        <Card title="Customer & vehicle" className="lg:col-span-2">
          <VehicleForm value={vehicle} onChange={setVehicle} lookup={lookup} onLookup={setLookup} />
        </Card>

        <div className="space-y-6">
          <Card title="Service">
            <div className="space-y-4">
              <LocationPicker value={loc} onChange={setLoc} />
              <div className="grid grid-cols-2 gap-2">
                {meta.services.map((s) => {
                  const price = meta.prices.find((p) => p.service_id === s.id && p.car_size === vehicle.car_size);
                  const active = String(serviceId) === String(s.id);
                  return (
                    <button
                      type="button"
                      key={s.id}
                      onClick={() => setServiceId(String(s.id))}
                      className={`rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                        active
                          ? 'border-brand-600 bg-brand-600 text-white'
                          : 'border-slate-300 bg-white hover:border-brand-400'
                      }`}
                    >
                      <div className="font-medium">{s.name}</div>
                      <div className={`text-xs ${active ? 'text-brand-100' : 'text-slate-500'}`}>
                        {price ? formatMoney(price.amount) : 'Pick car size'}
                      </div>
                    </button>
                  );
                })}
              </div>

              {coveringMembership && (
                <label className="flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={useMembership}
                    onChange={(e) => setUseMembership(e.target.checked)}
                  />
                  <span>
                    Use a membership wash from card <span className="font-mono">{coveringMembership.serial}</span> (
                    {coveringMembership.washes_total - coveringMembership.washes_used} left)
                  </span>
                </label>
              )}
            </div>
          </Card>

          <Card title="To pay">
            {quote ? (
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">{serviceName(serviceId)} · {vehicle.car_size}</dt>
                  <dd className="tabular-nums">{formatMoney(quote.list_price)}</dd>
                </div>
                {quote.discount > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <dt>{quote.used_membership_wash ? 'Membership wash' : 'Member discount'}</dt>
                    <dd className="tabular-nums">−{formatMoney(quote.discount)}</dd>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-200 pt-2 text-lg font-semibold">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{formatMoney(quote.amount_paid)}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-slate-500">Choose a car size and service to see the price.</p>
            )}
            <Button type="submit" className="mt-4 w-full" disabled={busy || !serviceId}>
              {busy ? 'Saving…' : 'Save car'}
            </Button>
          </Card>
        </div>
      </form>
    </>
  );
}
