import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import ResourcePage from '@/shared/components/ResourcePage';
import { api } from '@/shared/lib/api';
import { useToast } from '@/shared/context/ToastContext';

export default function Products() {
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const remove = async (row) => {
    if (!window.confirm(`Delete ${row.brand} ${row.model}?`)) return;
    try {
      await api(`/products/${row._id}`, { method: 'DELETE' });
      toast.success('Product deleted');
      setVersion((v) => v + 1);
    } catch (e) { toast.error(e.message); }
  };

  return (
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
      ]}
      rowActions={({ row }) => <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(row)}>Delete</Button>}
      fields={[
        { name: 'brand', label: 'Brand' },
        { name: 'model', label: 'Model' },
        { name: 'category', label: 'Category (e.g. Drive, UPS)' },
        { name: 'warrantyMonths', label: 'Standard warranty (months)', type: 'number' },
      ]}
    />
  );
}
