import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Input, NativeSelect } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { useApi } from '@/shared/lib/useApi';
import ResourcePage from '@/shared/components/ResourcePage';
import { api } from '@/shared/lib/api';
import { useToast } from '@/shared/context/ToastContext';

export default function Products() {
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState(null);
  const { data: subtypes } = useApi('/catalog/subtypes?limit=200');
  const save = async () => {
    try {
      await api(`/products/${editing._id}`, { method: 'PATCH', body: { brand: editing.brand, model: editing.model, category: editing.category, warrantyMonths: Number(editing.warrantyMonths) || 0, subtypeId: editing.subtypeId || null } });
      toast.success('Product updated'); setEditing(null); setVersion((v) => v + 1);
    } catch (e) { toast.error(e.message); }
  };
  const typeName = (id) => { const t = subtypes?.items?.find((s) => s._id === id); return t ? `${t.category} · ${t.name}` : '—'; };
  const remove = async (row) => {
    if (!window.confirm(`Delete ${row.brand} ${row.model}?`)) return;
    try {
      await api(`/products/${row._id}`, { method: 'DELETE' });
      toast.success('Product deleted');
      setVersion((v) => v + 1);
    } catch (e) { toast.error(e.message); }
  };

  return (
    <>
    <ResourcePage
      eyebrow="Catalog"
      title="Products"
      endpoint="/products"
      createLabel="Add Product"
      refreshKey={version}
      columns={[
        { key: 'brand', label: 'Brand' },
        { key: 'model', label: 'Model' },
        { key: 'category', label: 'Category' },
        { key: 'warrantyMonths', label: 'Warranty (months)' },
        { key: 'subtypeId', label: 'Product type', render: (r) => typeName(r.subtypeId), csv: (r) => typeName(r.subtypeId) },
      ]}
      rowActions={({ row }) => (
        <>
          <Button size="sm" variant="outline" onClick={() => setEditing({ ...row, subtypeId: row.subtypeId?._id || row.subtypeId || '' })}>Edit</Button>
          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(row)}>Delete</Button>
        </>
      )}
      fields={[
        { name: 'brand', label: 'Brand' },
        { name: 'model', label: 'Model' },
        { name: 'category', label: 'Category (e.g. Drive, UPS)' },
        { name: 'warrantyMonths', label: 'Standard warranty (months)', type: 'number' },
        { name: 'subtypeId', label: 'Product type (decides the customer price)', type: 'remote', endpoint: '/catalog/subtypes', optionLabel: (o) => `${o.category} · ${o.name}`, required: false },
      ]}
    />
    <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit product</DialogTitle></DialogHeader>
        {editing && (
          <div className="grid gap-3 sm:grid-cols-2">
            {[['brand', 'Brand'], ['model', 'Model'], ['category', 'Category'], ['warrantyMonths', 'Warranty (months)']].map(([k, l]) => (
              <div key={k} className="space-y-1.5"><Label>{l}</Label><Input type={k === 'warrantyMonths' ? 'number' : 'text'} value={editing[k] ?? ''} onChange={(e) => setEditing({ ...editing, [k]: e.target.value })} /></div>
            ))}
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Product type (decides the customer price)</Label>
              <NativeSelect value={editing.subtypeId || ''} onChange={(e) => setEditing({ ...editing, subtypeId: e.target.value })}>
                <option value="">Not set</option>
                {(subtypes?.items || []).map((t) => <option key={t._id} value={t._id}>{t.category} · {t.name}</option>)}
              </NativeSelect>
            </div>
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={save}>Save</Button></div>
      </DialogContent>
    </Dialog>
    </>
  );
}