import { useState } from 'react';
import { useSession } from '../session';
import { Alert, Button, Field, Input } from '../ui';

const DEMO_ROLES = [
  ['owner', 'Owner', 'All locations, reports & settings'],
  ['manager', 'Manager', 'Record cars & daily inventory'],
  ['sales', 'Sales / Marketing', 'Sell memberships'],
];

export default function Login() {
  const { login, demoLogin } = useSession();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const submit = (e) => {
    e.preventDefault();
    run(() => login(username, password));
  };

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-brand-900 to-brand-700 p-4">
      <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-2 text-center">
          <div className="text-2xl font-bold text-brand-900">JD Car Wash</div>
          <div className="text-sm text-slate-500">& Detailing Services</div>
        </div>

        <div>
          <div className="mb-2 text-sm font-medium text-slate-700">Try the demo as</div>
          <div className="space-y-2">
            {DEMO_ROLES.map(([role, label, sub]) => (
              <button
                key={role}
                type="button"
                disabled={busy}
                onClick={() => run(() => demoLogin(role))}
                className="flex w-full items-center justify-between rounded-lg border border-slate-300 px-4 py-2.5 text-left hover:border-brand-500 hover:bg-brand-50 disabled:opacity-50"
              >
                <span>
                  <span className="block text-sm font-medium text-slate-900">{label}</span>
                  <span className="block text-xs text-slate-500">{sub}</span>
                </span>
                <span className="text-brand-600">→</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-400">
          <div className="h-px flex-1 bg-slate-200" /> or sign in <div className="h-px flex-1 bg-slate-200" />
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Alert>{error}</Alert>
          <Field label="Username">
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <p className="text-center text-xs text-slate-400">Demo mode · data is saved in this browser only</p>
      </div>
    </div>
  );
}
