import { useState } from 'react';
import { api, ROLE_LABEL } from '../../api';
import { useSession } from '../../session';
import { Alert, Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Table, useFetch } from '../../ui';

export default function Staff() {
  const { refreshMeta } = useSession();
  const { data, error, reload } = useFetch(() => api('/users'), []);
  const [editing, setEditing] = useState(null);

  return (
    <>
      <PageHeader
        title="Staff & logins"
        subtitle="Each location has a manager and a sales/marketing team. Everyone signs in with their own username."
        actions={<Button onClick={() => setEditing({ name: '', username: '', role: 'manager', location_id: '', active: 1 })}>Add staff</Button>}
      />
      <Alert>{error}</Alert>
      <Card>
        <Table
          rows={data || []}
          columns={[
            { key: 'name', label: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
            { key: 'username', label: 'Username' },
            { key: 'role', label: 'Role', render: (r) => ROLE_LABEL[r.role] },
            { key: 'location_name', label: 'Location', render: (r) => r.location_name || 'All' },
            { key: 'active', label: '', render: (r) => (r.active ? <Badge color="green">Active</Badge> : <Badge color="red">Disabled</Badge>) },
            { key: 'edit', label: '', render: (r) => <Button variant="ghost" className="!px-2 !py-1" onClick={() => setEditing(r)}>Edit</Button> },
          ]}
        />
      </Card>
      {editing && (
        <StaffForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
            refreshMeta();
          }}
        />
      )}
    </>
  );
}

function StaffForm({ initial, onClose, onSaved }) {
  const { meta } = useSession();
  const [f, setF] = useState({ ...initial, password: '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const isNew = !initial.id;

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api(isNew ? '/users' : `/users/${initial.id}`, {
        method: isNew ? 'POST' : 'PUT',
        body: { ...f, active: !!Number(f.active) },
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Modal title={isNew ? 'Add staff' : `Edit ${initial.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Alert>{error}</Alert>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Full name">
            <Input value={f.name} onChange={set('name')} required />
          </Field>
          <Field label="Username">
            <Input value={f.username} onChange={set('username')} disabled={!isNew} required autoComplete="off" />
          </Field>
          <Field label="Role">
            <Select value={f.role} onChange={set('role')}>
              <option value="manager">Manager</option>
              <option value="sales">Sales / Marketing</option>
              <option value="owner">Owner (all locations)</option>
            </Select>
          </Field>
          {f.role !== 'owner' && (
            <Field label="Location">
              <Select value={f.location_id || ''} onChange={set('location_id')} required>
                <option value="">Select…</option>
                {meta.locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        <Field label={isNew ? 'Password' : 'New password'} hint={isNew ? 'At least 6 characters' : 'Leave blank to keep the current password'}>
          <Input type="password" value={f.password} onChange={set('password')} required={isNew} minLength={6} autoComplete="new-password" />
        </Field>
        {!isNew && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!Number(f.active)} onChange={(e) => setF({ ...f, active: e.target.checked ? 1 : 0 })} />
            Account active (untick to block this person from signing in)
          </label>
        )}
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
