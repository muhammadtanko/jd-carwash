import { useState } from 'react';
import { api, qs } from '../api';
import { useSession } from '../session';
import { Alert, Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Table, statusColor, useFetch } from '../ui';

export default function Cards() {
  const { meta, locationId } = useSession();
  const [status, setStatus] = useState('available');
  const [showAdd, setShowAdd] = useState(false);
  const [msg, setMsg] = useState({ kind: '', text: '' });
  const { data, error, reload } = useFetch(
    () => api(`/cards${qs({ status: status === 'all' ? '' : status, location_id: locationId })}`),
    [status, locationId]
  );
  const count = (s) => data?.summary.find((x) => x.status === s)?.n || 0;

  const update = async (card, body) => {
    try {
      await api(`/cards/${card.id}`, { method: 'PATCH', body });
      reload();
    } catch (e) {
      setMsg({ kind: 'error', text: e.message });
    }
  };

  return (
    <>
      <PageHeader
        title="Membership cards"
        subtitle="Register each batch of pre-printed cards so their serial numbers can be sold."
        actions={<Button onClick={() => setShowAdd(true)}>Register card batch</Button>}
      />
      <div className="mb-4 flex flex-wrap gap-3 text-sm">
        {['available', 'sold', 'void', 'all'].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-lg border px-3 py-1.5 capitalize ${status === s ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white'}`}
          >
            {s} {s !== 'all' && <span className="opacity-75">({count(s)})</span>}
          </button>
        ))}
      </div>
      <div className="mb-4 space-y-2">
        <Alert>{error}</Alert>
        <Alert kind={msg.kind}>{msg.text}</Alert>
      </div>
      <Card>
        <Table
          rows={data?.cards || []}
          empty="No cards here"
          columns={[
            { key: 'serial', label: 'Serial', render: (r) => <span className="font-mono">{r.serial}</span> },
            { key: 'status', label: 'Status', render: (r) => <Badge color={statusColor(r.status)}>{r.status}</Badge> },
            {
              key: 'location',
              label: 'Location',
              render: (r) =>
                r.status === 'sold' ? (
                  r.location_name
                ) : (
                  <select
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                    value={r.location_id || ''}
                    onChange={(e) => update(r, { location_id: e.target.value ? Number(e.target.value) : null })}
                  >
                    <option value="">Any location</option>
                    {meta.locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                ),
            },
            { key: 'plate', label: 'Sold to', render: (r) => (r.plate ? <span className="font-mono">{r.plate}</span> : '—') },
            {
              key: 'actions',
              label: '',
              render: (r) =>
                r.status === 'available' ? (
                  <Button variant="ghost" className="!px-2 !py-1 text-red-600" onClick={() => update(r, { status: 'void' })}>
                    Void
                  </Button>
                ) : r.status === 'void' ? (
                  <Button variant="ghost" className="!px-2 !py-1" onClick={() => update(r, { status: 'available' })}>
                    Restore
                  </Button>
                ) : null,
            },
          ]}
        />
      </Card>
      {showAdd && (
        <AddBatch
          onClose={() => setShowAdd(false)}
          onDone={(text) => {
            setShowAdd(false);
            setMsg({ kind: 'success', text });
            reload();
          }}
        />
      )}
    </>
  );
}

function AddBatch({ onClose, onDone }) {
  const { meta } = useSession();
  const [f, setF] = useState({ prefix: 'JD-', start: 1, count: 100, digits: 5, location_id: '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const first = `${f.prefix}${String(Number(f.start) || 0).padStart(Number(f.digits) || 1, '0')}`;
  const last = `${f.prefix}${String((Number(f.start) || 0) + (Number(f.count) || 1) - 1).padStart(Number(f.digits) || 1, '0')}`;

  const submit = async (e) => {
    e.preventDefault();
    try {
      const r = await api('/cards/batch', { method: 'POST', body: f });
      onDone(`${r.added} cards registered (${first} to ${last}).${r.skipped ? ` ${r.skipped} already existed and were skipped.` : ''}`);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Modal title="Register card batch" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Alert>{error}</Alert>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Prefix" hint="Printed before the number">
            <Input value={f.prefix} onChange={set('prefix')} />
          </Field>
          <Field label="Digits" hint="Zero-padding, e.g. 5 → 00001">
            <Input type="number" min="1" max="10" value={f.digits} onChange={set('digits')} />
          </Field>
          <Field label="First number">
            <Input type="number" min="1" value={f.start} onChange={set('start')} required />
          </Field>
          <Field label="How many cards">
            <Input type="number" min="1" max="10000" value={f.count} onChange={set('count')} required />
          </Field>
        </div>
        <Field label="Location" hint="Leave as 'Any location' if cards can be sold anywhere">
          <Select value={f.location_id} onChange={set('location_id')}>
            <option value="">Any location</option>
            {meta.locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          Serials: <span className="font-mono">{first}</span> to <span className="font-mono">{last}</span>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Register</Button>
        </div>
      </form>
    </Modal>
  );
}
