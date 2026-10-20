import { useState } from 'react';
import { api, formatMoney } from '../../api';
import { useSession } from '../../session';
import { Alert, Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Table } from '../../ui';

const blank = {
  name: '',
  service_id: '',
  washes: 4,
  discount_pct: 10,
  validity_days: 30,
  price_small: '',
  price_medium: '',
  price_large: '',
  active: 1,
};

export default function Packages() {
  const { meta, refreshMeta } = useSession();
  const [editing, setEditing] = useState(null);

  return (
    <>
      <PageHeader
        title="Membership packages"
        subtitle="Each package gives a set number of washes of one service, plus a discount on other services while the card is valid."
        actions={<Button onClick={() => setEditing(blank)}>New package</Button>}
      />
      <Card>
        <Table
          rows={meta.packages}
          empty="No packages yet. Create one to start selling memberships."
          columns={[
            { key: 'name', label: 'Package', render: (r) => <span className="font-medium">{r.name}</span> },
            { key: 'service_name', label: 'Service' },
            { key: 'washes', label: 'Washes', right: true },
            { key: 'discount_pct', label: 'Discount', right: true, render: (r) => `${r.discount_pct}%` },
            { key: 'validity_days', label: 'Valid for', right: true, render: (r) => `${r.validity_days} days` },
            { key: 'price_small', label: 'Small', right: true, render: (r) => formatMoney(r.price_small) },
            { key: 'price_medium', label: 'Medium', right: true, render: (r) => formatMoney(r.price_medium) },
            { key: 'price_large', label: 'Large', right: true, render: (r) => formatMoney(r.price_large) },
            { key: 'active', label: '', render: (r) => (r.active ? <Badge color="green">On sale</Badge> : <Badge>Retired</Badge>) },
            { key: 'edit', label: '', render: (r) => <Button variant="ghost" className="!px-2 !py-1" onClick={() => setEditing(r)}>Edit</Button> },
          ]}
        />
      </Card>
      {editing && (
        <PackageForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            await refreshMeta();
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function PackageForm({ initial, onClose, onSaved }) {
  const { meta } = useSession();
  const [f, setF] = useState(initial);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  // Suggest prices from the regular service price × number of washes.
  const suggest = () => {
    const p = (size) => meta.prices.find((x) => String(x.service_id) === String(f.service_id) && x.car_size === size)?.amount || 0;
    setF({ ...f, price_small: p('Small') * f.washes, price_medium: p('Medium') * f.washes, price_large: p('Large') * f.washes });
  };

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api(initial.id ? `/packages/${initial.id}` : '/packages', {
        method: initial.id ? 'PUT' : 'POST',
        body: { ...f, active: !!Number(f.active) },
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Modal title={initial.id ? 'Edit package' : 'New package'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Alert>{error}</Alert>
        <Field label="Package name">
          <Input value={f.name} onChange={set('name')} placeholder="e.g. Premium Monthly" required />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Service">
            <Select value={f.service_id} onChange={set('service_id')} required>
              <option value="">Select…</option>
              {meta.services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Number of washes">
            <Input type="number" min="1" value={f.washes} onChange={set('washes')} required />
          </Field>
          <Field label="Discount on other services (%)">
            <Input type="number" min="0" max="100" step="any" value={f.discount_pct} onChange={set('discount_pct')} required />
          </Field>
          <Field label="Valid for (days)">
            <Input type="number" min="1" value={f.validity_days} onChange={set('validity_days')} required />
          </Field>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Package price by car size (₦)</span>
            {f.service_id && (
              <button type="button" onClick={suggest} className="text-xs text-brand-700 hover:underline">
                Fill with regular price × washes
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {['small', 'medium', 'large'].map((s) => (
              <Field key={s} label={s[0].toUpperCase() + s.slice(1)}>
                <Input type="number" min="0" value={f[`price_${s}`]} onChange={set(`price_${s}`)} required />
              </Field>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!Number(f.active)} onChange={(e) => setF({ ...f, active: e.target.checked ? 1 : 0 })} />
          On sale (untick to retire this package; existing cards keep working)
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Modal>
  );
}
