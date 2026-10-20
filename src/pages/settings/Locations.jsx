import { useState } from 'react';
import { api } from '../../api';
import { useSession } from '../../session';
import { Alert, Badge, Button, Card, Field, Input, Modal, PageHeader, Table } from '../../ui';

export default function Locations() {
  const { meta, refreshMeta } = useSession();
  const [editing, setEditing] = useState(null);

  return (
    <>
      <PageHeader
        title="Locations"
        actions={<Button onClick={() => setEditing({ name: '', address: '', active: 1 })}>Add location</Button>}
      />
      <Card>
        <Table
          rows={meta.locations}
          columns={[
            { key: 'name', label: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
            { key: 'address', label: 'Address', render: (r) => r.address || '—' },
            { key: 'active', label: '', render: (r) => (r.active ? <Badge color="green">Open</Badge> : <Badge>Closed</Badge>) },
            { key: 'edit', label: '', render: (r) => <Button variant="ghost" className="!px-2 !py-1" onClick={() => setEditing(r)}>Edit</Button> },
          ]}
        />
      </Card>
      {editing && (
        <SimpleForm
          title={editing.id ? 'Edit location' : 'Add location'}
          initial={editing}
          onClose={() => setEditing(null)}
          onSubmit={(f) =>
            api(editing.id ? `/locations/${editing.id}` : '/locations', {
              method: editing.id ? 'PUT' : 'POST',
              body: { ...f, active: !!Number(f.active) },
            }).then(async () => {
              await refreshMeta();
              setEditing(null);
            })
          }
          fields={[
            ['name', 'Location name'],
            ['address', 'Address'],
          ]}
          activeLabel="Open (untick if this location has closed)"
        />
      )}
    </>
  );
}

export function SimpleForm({ title, initial, fields, onSubmit, onClose, activeLabel }) {
  const [f, setF] = useState(initial);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try {
      await onSubmit(f);
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Alert>{error}</Alert>
        {fields.map(([k, label, type = 'text']) => (
          <Field key={k} label={label}>
            <Input type={type} value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} required={k === 'name'} />
          </Field>
        ))}
        {initial.id && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!Number(f.active)} onChange={(e) => setF({ ...f, active: e.target.checked ? 1 : 0 })} />
            {activeLabel}
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
