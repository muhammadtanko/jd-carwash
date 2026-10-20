import { useEffect, useState } from 'react';
import { api, qs } from '../api';
import { useSession } from '../session';
import { Alert, Badge, Button, Card, Field, Input, PageHeader, useFetch } from '../ui';

const numCls =
  'w-24 rounded-md border border-slate-300 px-2 py-1.5 text-right tabular-nums focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:border-transparent disabled:bg-transparent';

export default function Inventory() {
  const { meta, locationId, isOwner } = useSession();
  const [date, setDate] = useState(meta.today);
  const [rows, setRows] = useState({});
  const [msg, setMsg] = useState({ kind: '', text: '' });
  const [busy, setBusy] = useState(false);

  const { data, error, reload } = useFetch(
    () => (locationId ? api(`/inventory${qs({ date, location_id: locationId })}`) : Promise.resolve([])),
    [date, locationId]
  );

  useEffect(() => {
    if (!data) return;
    const next = {};
    for (const { item, entry, previous_closing } of data) {
      next[item.id] = {
        opening: entry ? entry.opening : (previous_closing ?? ''),
        received: entry ? entry.received : '',
        used: entry ? entry.used : '',
        note: entry?.note || '',
        lockedOpening: previous_closing !== null,
        saved: !!entry,
      };
    }
    setRows(next);
    setMsg({ kind: '', text: '' });
  }, [data]);

  if (isOwner && !locationId) {
    return (
      <>
        <PageHeader title="Daily inventory" />
        <Alert kind="info">Choose a location at the top of the page to view or record its stock.</Alert>
      </>
    );
  }

  const set = (id, k) => (e) => setRows((r) => ({ ...r, [id]: { ...r[id], [k]: e.target.value } }));
  const n = (v) => Number(v) || 0;

  const save = async () => {
    setBusy(true);
    setMsg({ kind: '', text: '' });
    try {
      const entries = Object.entries(rows)
        .filter(([, r]) => r.saved || r.received !== '' || r.used !== '' || (!r.lockedOpening && r.opening !== ''))
        .map(([item_id, r]) => ({ item_id, opening: n(r.opening), received: n(r.received), used: n(r.used), note: r.note }));
      await api('/inventory', { method: 'PUT', body: { date, location_id: locationId, entries } });
      setMsg({ kind: 'success', text: `Stock for ${date} saved.` });
      reload();
    } catch (e) {
      setMsg({ kind: 'error', text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const recordedCount = Object.values(rows).filter((r) => r.saved).length;

  return (
    <>
      <PageHeader
        title="Daily inventory"
        subtitle="Opening stock carries over from the previous day's closing. Enter what was received and used."
        actions={
          <Button onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save stock'}
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <Field label="Date" className="w-44">
          <Input type="date" value={date} max={meta.today} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </Field>
        {data && (
          <div className="pb-2 text-sm text-slate-500">
            {recordedCount} of {data.length} items recorded for this day
          </div>
        )}
      </div>
      <div className="mb-4 space-y-2">
        <Alert>{error}</Alert>
        <Alert kind={msg.kind}>{msg.text}</Alert>
      </div>
      <Card>
        <div className="-mx-5 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-2 font-medium">Item</th>
                <th className="px-3 py-2 text-right font-medium">Opening</th>
                <th className="px-3 py-2 text-right font-medium">Received</th>
                <th className="px-3 py-2 text-right font-medium">Used</th>
                <th className="px-3 py-2 text-right font-medium">Closing</th>
                <th className="px-3 py-2 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {(data || []).map(({ item }) => {
                const r = rows[item.id];
                if (!r) return null;
                const closing = n(r.opening) + n(r.received) - n(r.used);
                const counted = r.saved || r.opening !== '';
                const low = counted && closing <= item.reorder_level;
                return (
                  <tr key={item.id} className="border-b border-slate-100 last:border-0">
                    <td className="min-w-44 px-5 py-2">
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-slate-500">
                        {item.unit} · reorder at {item.reorder_level}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        className={numCls}
                        value={r.opening}
                        onChange={set(item.id, 'opening')}
                        disabled={r.lockedOpening}
                        title={r.lockedOpening ? "Carried over from the previous day's closing" : 'First count for this item — enter current stock'}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input type="number" min="0" step="any" className={numCls} value={r.received} onChange={set(item.id, 'received')} placeholder="0" />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input type="number" min="0" step="any" className={numCls} value={r.used} onChange={set(item.id, 'used')} placeholder="0" />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className={`tabular-nums font-semibold ${closing < 0 ? 'text-red-600' : ''}`}>{closing}</span>{' '}
                      {low && closing >= 0 && <Badge color="red">Low</Badge>}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="w-44 rounded-md border border-slate-300 px-2 py-1.5 focus:border-brand-500 focus:outline-none"
                        value={r.note}
                        onChange={set(item.id, 'note')}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
