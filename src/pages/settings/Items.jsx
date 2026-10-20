import { useState } from 'react';
import { api } from '../../api';
import { useSession } from '../../session';
import { Badge, Button, Card, PageHeader, Table } from '../../ui';
import { SimpleForm } from './Locations';

export default function Items() {
  const { meta, refreshMeta } = useSession();
  const [editing, setEditing] = useState(null);

  return (
    <>
      <PageHeader
        title="Inventory items"
        subtitle="Items every location counts daily. A low-stock alert shows when closing stock reaches the reorder level."
        actions={<Button onClick={() => setEditing({ name: '', unit: 'units', reorder_level: 0, active: 1 })}>Add item</Button>}
      />
      <Card>
        <Table
          rows={meta.items}
          columns={[
            { key: 'name', label: 'Item', render: (r) => <span className="font-medium">{r.name}</span> },
            { key: 'unit', label: 'Unit' },
            { key: 'reorder_level', label: 'Reorder level', right: true },
            { key: 'active', label: '', render: (r) => (r.active ? <Badge color="green">Tracked</Badge> : <Badge>Not tracked</Badge>) },
            { key: 'edit', label: '', render: (r) => <Button variant="ghost" className="!px-2 !py-1" onClick={() => setEditing(r)}>Edit</Button> },
          ]}
        />
      </Card>
      {editing && (
        <SimpleForm
          title={editing.id ? 'Edit item' : 'Add item'}
          initial={editing}
          onClose={() => setEditing(null)}
          onSubmit={(f) =>
            api(editing.id ? `/items/${editing.id}` : '/items', {
              method: editing.id ? 'PUT' : 'POST',
              body: { ...f, active: !!Number(f.active) },
            }).then(async () => {
              await refreshMeta();
              setEditing(null);
            })
          }
          fields={[
            ['name', 'Item name'],
            ['unit', 'Unit (litres, bottles, pieces…)'],
            ['reorder_level', 'Reorder level', 'number'],
          ]}
          activeLabel="Track this item in daily inventory"
        />
      )}
    </>
  );
}
