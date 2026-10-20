import { useState } from 'react';
import { api } from '../api';
import { useSession } from '../session';
import { Badge, Field, Input, Select, statusColor } from '../ui';

export const emptyVehicle = {
  plate: '',
  customer_name: '',
  car_type: '',
  car_size: '',
  color: '',
  phone: '',
  address: '',
};

/**
 * Customer + vehicle fields with plate-number lookup.
 * When the plate is found the form is pre-filled and the customer is marked "existing".
 * `lookup` is { found, vehicle, memberships, visits } or null when not yet checked.
 */
export default function VehicleForm({ value, onChange, lookup, onLookup }) {
  const { meta } = useSession();
  const [checking, setChecking] = useState(false);
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });

  const check = async () => {
    const plate = value.plate.trim();
    if (plate.length < 3) return onLookup(null);
    setChecking(true);
    try {
      const r = await api(`/vehicles/lookup/${encodeURIComponent(plate)}`);
      onLookup(r);
      if (r.found) {
        const v = r.vehicle;
        onChange({
          plate: v.plate,
          customer_name: v.customer_name || '',
          car_type: v.car_type,
          car_size: v.car_size,
          color: v.color,
          phone: v.phone,
          address: v.address || '',
        });
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Plate number"
          hint={checking ? 'Checking…' : 'Press Tab or click away to look up the customer'}
        >
          <Input
            value={value.plate}
            onChange={(e) => {
              onLookup(null);
              onChange({ ...value, plate: e.target.value.toUpperCase() });
            }}
            onBlur={check}
            placeholder="e.g. KAD 123 AB"
            required
            autoFocus
            className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-lg uppercase tracking-wider focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </Field>
        <div className="flex items-end pb-1">
          {lookup &&
            (lookup.found ? (
              <div className="space-y-1">
                <Badge color="slate">Existing customer</Badge>
                <div className="text-xs text-slate-500">
                  {lookup.visits.length} previous visit{lookup.visits.length === 1 ? '' : 's'}
                  {lookup.visits[0] && ` · last on ${lookup.visits[0].visit_date}`}
                </div>
              </div>
            ) : (
              <Badge color="purple">New customer</Badge>
            ))}
        </div>
      </div>

      {lookup?.found && lookup.memberships.length > 0 && (
        <div className="rounded-lg border border-brand-100 bg-brand-50 p-3 text-sm">
          <div className="mb-1 font-medium text-brand-900">Membership cards</div>
          <ul className="space-y-1">
            {lookup.memberships.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{m.serial}</span>
                <span>
                  {m.package_name} ({m.service_name}) — {m.washes_total - m.washes_used} of {m.washes_total} washes left,{' '}
                  {m.discount_pct}% off, expires {m.expiry_date}
                </span>
                <Badge color={statusColor(m.status)}>{m.status}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Car type" hint="Make and model, e.g. Toyota Corolla">
          <Input value={value.car_type} onChange={set('car_type')} required />
        </Field>
        <Field label="Car size" hint="Sets the price">
          <Select value={value.car_size} onChange={set('car_size')} required>
            <option value="">Select size…</option>
            {meta.sizes.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="Car colour">
          <Input value={value.color} onChange={set('color')} required />
        </Field>
        <Field label="Phone number">
          <Input type="tel" value={value.phone} onChange={set('phone')} required />
        </Field>
        <Field label="Customer name (optional)">
          <Input value={value.customer_name} onChange={set('customer_name')} />
        </Field>
        <Field label="Home address">
          <Input value={value.address} onChange={set('address')} />
        </Field>
      </div>
    </div>
  );
}

/** Location picker for the owner when "All locations" is selected (staff always post to their own). */
export function LocationPicker({ value, onChange }) {
  const { meta, isOwner } = useSession();
  if (!isOwner) return null;
  return (
    <Field label="Location">
      <Select value={value} onChange={(e) => onChange(e.target.value)} required>
        <option value="">Select location…</option>
        {meta.locations
          .filter((l) => l.active)
          .map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
      </Select>
    </Field>
  );
}
