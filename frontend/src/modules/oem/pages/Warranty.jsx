import ResourcePage from '@/shared/components/ResourcePage';
import { Badge } from '@/shared/components/ui/badge';
import { fmtDate } from '@/shared/lib/format';

export default function Warranty() {
  return (
    <ResourcePage
      eyebrow="Catalog"
      title="Warranty"
      endpoint="/products/passports"
      filterKey="status"
      filterLabel="All warranty states"
      filterOptions={['In Warranty', 'Expiring Soon', 'Expired']}
      createLabel="Register Warranty"
      columns={[
        { key: 'warrantyNo', label: 'Warranty No', render: (r) => r.warrantyNo || '—' },
        { key: 'customerName', label: 'Customer' },
        { key: 'customerPhone', label: 'Phone' },
        { key: 'model', label: 'Product', render: (r) => [r.brand, r.model].filter(Boolean).join(' ') },
        { key: 'serialNumber', label: 'Serial No' },
        { key: 'purchaseDate', label: 'Purchased', render: (r) => fmtDate(r.purchaseDate), csv: (r) => fmtDate(r.purchaseDate) },
        { key: 'warrantyEnd', label: 'Warranty ends', render: (r) => fmtDate(r.warrantyEnd), csv: (r) => fmtDate(r.warrantyEnd) },
        { key: 'warrantyStatus', label: 'Status', render: (r) => <Badge>{r.warrantyStatus}</Badge> },
      ]}
      fields={[
        { name: 'warrantyNo', label: 'Warranty number' },
        { name: 'customerName', label: 'Customer name' },
        { name: 'customerPhone', label: 'Customer phone' },
        { name: 'brand', label: 'Brand' },
        { name: 'model', label: 'Model' },
        { name: 'serialNumber', label: 'Serial number' },
        { name: 'purchaseDate', label: 'Purchase date', type: 'date' },
        { name: 'warrantyEnd', label: 'Warranty end date', type: 'date' },
      ]}
    />
  );
}
