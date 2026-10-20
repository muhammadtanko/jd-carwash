import { useState } from 'react';
import { api } from '../../api';
import { useSession } from '../../session';
import { Alert, Button, Card, PageHeader } from '../../ui';

export default function Prices() {
  const { meta, refreshMeta } = useSession();
  const [values, setValues] = useState(() =>
    Object.fromEntries(meta.prices.map((p) => [`${p.service_id}|${p.car_size}`, String(p.amount)]))
  );
  const [msg, setMsg] = useState({ kind: '', text: '' });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api('/prices', {
        method: 'PUT',
        body: Object.entries(values).map(([k, amount]) => {
          const [service_id, car_size] = k.split('|');
          return { service_id: Number(service_id), car_size, amount };
        }),
      });
      await refreshMeta();
      setMsg({ kind: 'success', text: 'Prices saved. New prices apply to cars recorded from now on.' });
    } catch (e) {
      setMsg({ kind: 'error', text: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Service prices"
        subtitle="Price for each service by car size, in Naira."
        actions={
          <Button onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save prices'}
          </Button>
        }
      />
      <div className="mb-4">
        <Alert kind={msg.kind}>{msg.text}</Alert>
      </div>
      <Card>
        <div className="-mx-5 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-2 font-medium">Service</th>
                {meta.sizes.map((s) => (
                  <th key={s} className="px-3 py-2 text-right font-medium">
                    {s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {meta.services.map((s) => (
                <tr key={s.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-5 py-2 font-medium">{s.name}</td>
                  {meta.sizes.map((size) => {
                    const k = `${s.id}|${size}`;
                    return (
                      <td key={size} className="px-3 py-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          <span className="text-slate-400">₦</span>
                          <input
                            type="number"
                            min="0"
                            step="50"
                            value={values[k] ?? ''}
                            onChange={(e) => setValues({ ...values, [k]: e.target.value })}
                            className="w-28 rounded-md border border-slate-300 px-2 py-1.5 text-right tabular-nums focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                          />
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
