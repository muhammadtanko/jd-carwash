import { useCallback, useEffect, useState } from 'react';

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, className = '', actions }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
          <h2 className="font-semibold text-slate-800">{title}</h2>
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

const btn = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-300',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 disabled:opacity-50',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:opacity-50',
  ghost: 'text-brand-700 hover:bg-brand-50',
};
export function Button({ variant = 'primary', className = '', ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${btn[variant]} ${className}`}
      {...props}
    />
  );
}

export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:bg-slate-100';
export const Input = (props) => <input className={inputCls} {...props} />;
export const Textarea = (props) => <textarea className={inputCls} rows={2} {...props} />;
export function Select({ children, ...props }) {
  return (
    <select className={inputCls} {...props}>
      {children}
    </select>
  );
}

export function Alert({ kind = 'error', children }) {
  if (!children) return null;
  const cls = {
    error: 'bg-red-50 text-red-800 border-red-200',
    success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    info: 'bg-sky-50 text-sky-800 border-sky-200',
    warn: 'bg-amber-50 text-amber-900 border-amber-200',
  }[kind];
  return <div className={`rounded-lg border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}

export function Badge({ color = 'slate', children }) {
  const cls = {
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-emerald-100 text-emerald-800',
    blue: 'bg-sky-100 text-sky-800',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-700',
    purple: 'bg-violet-100 text-violet-800',
  }[color];
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

export const statusColor = (s) =>
  ({ active: 'green', expired: 'red', 'used up': 'amber', available: 'green', sold: 'blue', void: 'red', new: 'purple', existing: 'slate' })[s] ||
  'slate';

export function Table({ columns, rows, empty = 'Nothing to show yet', rowKey = (r) => r.id }) {
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            {columns.map((c) => (
              <th key={c.key} className={`whitespace-nowrap px-5 py-2 font-medium ${c.right ? 'text-right' : ''}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-5 py-8 text-center text-slate-500">
                {empty}
              </td>
            </tr>
          )}
          {rows.map((r, i) => (
            <tr key={rowKey(r, i)} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
              {columns.map((c) => (
                <td key={c.key} className={`whitespace-nowrap px-5 py-2.5 ${c.right ? 'text-right tabular-nums' : ''}`}>
                  {c.render ? c.render(r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Stat({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

/** Fetch helper: const { data, error, loading, reload } = useFetch(() => api('/x'), [deps]) */
export function useFetch(fn, deps) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);
  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    return run()
      .then((data) => setState({ data, error: '', loading: false }))
      .catch((e) => setState({ data: null, error: e.message, loading: false }));
  }, [run]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { ...state, reload };
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
