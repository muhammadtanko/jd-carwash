import { useState } from 'react';
import { useSession } from '../session';
import { Alert, Button, Field, Input } from '../ui';

export default function Login() {
  const { login } = useSession();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(username, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-brand-900 to-brand-700 p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-2 text-center">
          <div className="text-2xl font-bold text-brand-900">JD Car Wash</div>
          <div className="text-sm text-slate-500">& Detailing Services</div>
        </div>
        <Alert>{error}</Alert>
        <Field label="Username">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" required />
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
    </div>
  );
}
