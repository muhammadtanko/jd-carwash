import { Input } from '../ui';

const iso = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export function presetRange(name, todayStr) {
  const t = new Date(todayStr + 'T00:00:00');
  if (name === 'today') return { from: todayStr, to: todayStr };
  if (name === 'yesterday') {
    t.setDate(t.getDate() - 1);
    return { from: iso(t), to: iso(t) };
  }
  if (name === 'week') {
    const s = new Date(t);
    s.setDate(t.getDate() - ((t.getDay() + 6) % 7)); // Monday
    return { from: iso(s), to: todayStr };
  }
  if (name === 'month') return { from: todayStr.slice(0, 8) + '01', to: todayStr };
  return { from: todayStr, to: todayStr };
}

export default function DateRange({ value, onChange, today }) {
  const presets = [
    ['today', 'Today'],
    ['yesterday', 'Yesterday'],
    ['week', 'This week'],
    ['month', 'This month'],
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
        {presets.map(([k, label]) => {
          const r = presetRange(k, today);
          const active = r.from === value.from && r.to === value.to;
          return (
            <button
              key={k}
              type="button"
              onClick={() => onChange(r)}
              className={`rounded-md px-2.5 py-1 ${active ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-1 text-sm">
        <div className="w-36">
          <Input type="date" value={value.from} max={value.to} onChange={(e) => onChange({ ...value, from: e.target.value })} />
        </div>
        <span className="text-slate-400">to</span>
        <div className="w-36">
          <Input type="date" value={value.to} min={value.from} onChange={(e) => onChange({ ...value, to: e.target.value })} />
        </div>
      </div>
    </div>
  );
}
