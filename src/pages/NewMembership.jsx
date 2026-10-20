import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatMoney, qs } from '../api';
import { useSession } from '../session';
import { Alert, Button, Card, Field, Input, PageHeader, Select, useFetch } from '../ui';
import VehicleForm, { LocationPicker, emptyVehicle } from '../components/VehicleForm';

export default function NewMembership() {
  const { meta, user, locationId } = useSession();
  const [vehicle, setVehicle] = useState(emptyVehicle);
  const [lookup, setLookup] = useState(null);
  const [packageId, setPackageId] = useState('');
  const [serial, setSerial] = useState('');
  const [loc, setLoc] = useState(locationId);
  const [soldBy, setSoldBy] = useState(user.role === 'sales' ? String(user.id) : '');
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);

  const cards = useFetch(
    () => (loc ? api(`/cards${qs({ status: 'available', location_id: loc })}`) : Promise.resolve({ cards: [] })),
    [loc, done]
  );
  const available = cards.data?.cards || [];

  const packages = meta.packages.filter((p) => p.active);
  const pkg = packages.find((p) => String(p.id) === packageId);
  const price = pkg && vehicle.car_size ? pkg[`price_${vehicle.car_size.toLowerCase()}`] : null;
  const sellers = meta.salesStaff.filter((s) => !loc || String(s.location_id) === String(loc));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api('/memberships', {
        method: 'POST',
        body: { ...vehicle, package_id: packageId, card_serial: serial, sold_by: soldBy, location_id: loc },
      });
      setDone({ ...r, plate: vehicle.plate, package: pkg.name });
      setVehicle(emptyVehicle);
      setLookup(null);
      setPackageId('');
      setSerial('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Sell a membership"
        subtitle="Capture the customer's details and link them to a printed membership card."
      />
      <div className="mb-4 space-y-3">
        {done && (
          <Alert kind="success">
            Card <span className="font-mono font-semibold">{done.serial}</span> activated for{' '}
            <span className="font-mono">{done.plate}</span> ({done.package}). Collect{' '}
            <strong>{formatMoney(done.amount_paid)}</strong>. Valid until {done.expiry_date}.{' '}
            <Link to="/memberships" className="underline">
              View memberships
            </Link>
          </Alert>
        )}
        {packages.length === 0 && (
          <Alert kind="warn">
            No membership packages have been set up yet. The owner can add them under Settings → Packages.
          </Alert>
        )}
        <Alert>{error}</Alert>
      </div>

      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-3">
        <Card title="Customer & vehicle" className="lg:col-span-2">
          <VehicleForm value={vehicle} onChange={setVehicle} lookup={lookup} onLookup={setLookup} />
        </Card>

        <div className="space-y-6">
          <Card title="Package & card">
            <div className="space-y-4">
              <LocationPicker value={loc} onChange={setLoc} />
              <Field label="Package">
                <Select value={packageId} onChange={(e) => setPackageId(e.target.value)} required>
                  <option value="">Select package…</option>
                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.washes}× {p.service_name}
                    </option>
                  ))}
                </Select>
              </Field>
              {pkg && (
                <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                  <div>
                    {pkg.washes} {pkg.service_name} washes + {pkg.discount_pct}% off other services
                  </div>
                  <div>Valid for {pkg.validity_days} days</div>
                </div>
              )}
              <Field
                label="Card serial number"
                hint={
                  loc
                    ? `${available.length} unsold card${available.length === 1 ? '' : 's'} at this location${
                        available[0] ? ` · next: ${available[0].serial}` : ''
                      }`
                    : 'Choose a location first'
                }
              >
                <Input
                  list="available-cards"
                  value={serial}
                  onChange={(e) => setSerial(e.target.value.toUpperCase())}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono uppercase focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                  required
                />
                <datalist id="available-cards">
                  {available.slice(0, 200).map((c) => (
                    <option key={c.id} value={c.serial} />
                  ))}
                </datalist>
              </Field>
              {user.role !== 'sales' && (
                <Field label="Sold by" hint="The sales person who gets credit for this sale">
                  <Select value={soldBy} onChange={(e) => setSoldBy(e.target.value)} required>
                    <option value="">Select…</option>
                    {user.role === 'owner' && <option value={user.id}>{user.name} (Owner)</option>}
                    {sellers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.role === 'sales' ? 'Sales' : 'Manager'})
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </div>
          </Card>

          <Card title="To pay">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-slate-500">{vehicle.car_size ? `${vehicle.car_size} car` : 'Pick car size'}</span>
              <span className="text-2xl font-semibold tabular-nums">{price !== null ? formatMoney(price) : '—'}</span>
            </div>
            <Button type="submit" className="mt-4 w-full" disabled={busy || !pkg}>
              {busy ? 'Saving…' : 'Activate membership'}
            </Button>
          </Card>
        </div>
      </form>
    </>
  );
}
