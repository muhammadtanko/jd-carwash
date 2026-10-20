import { useState } from 'react';
import { api, ROLE_LABEL } from '../api';
import { useSession } from '../session';
import { Alert, Button, Card, Field, Input, PageHeader } from '../ui';

export default function Account() {
  const { user } = useSession();
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [msg, setMsg] = useState({ kind: '', text: '' });

  const submit = async (e) => {
    e.preventDefault();
    if (f.next !== f.confirm) return setMsg({ kind: 'error', text: 'New passwords do not match' });
    try {
      await api('/me/password', { method: 'POST', body: f });
      setF({ current: '', next: '', confirm: '' });
      setMsg({ kind: 'success', text: 'Password changed.' });
    } catch (err) {
      setMsg({ kind: 'error', text: err.message });
    }
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <>
      <PageHeader title="My account" subtitle={`${user.name} · ${ROLE_LABEL[user.role]}${user.location_name ? ` · ${user.location_name}` : ''}`} />
      <Card title="Change password" className="max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <Alert kind={msg.kind}>{msg.text}</Alert>
          <Field label="Current password">
            <Input type="password" value={f.current} onChange={set('current')} required autoComplete="current-password" />
          </Field>
          <Field label="New password" hint="At least 6 characters">
            <Input type="password" value={f.next} onChange={set('next')} required minLength={6} autoComplete="new-password" />
          </Field>
          <Field label="Confirm new password">
            <Input type="password" value={f.confirm} onChange={set('confirm')} required autoComplete="new-password" />
          </Field>
          <Button type="submit">Change password</Button>
        </form>
      </Card>
    </>
  );
}
