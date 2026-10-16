import ResourcePage from '@/shared/components/ResourcePage';
import { fmtDate } from '@/shared/lib/format';

export default function Customers() {
  return (
    <ResourcePage
      eyebrow="Customers"
      title="Customers"
      endpoint="/customers"
      columns={[
        { key: 'name', label: 'Customer' },
        { key: 'phone', label: 'Phone' },
        { key: 'addressCount', label: 'Saved addresses' },
        { key: 'requests', label: 'Service requests' },
        { key: 'createdAt', label: 'Joined', render: (r) => fmtDate(r.createdAt), csv: (r) => fmtDate(r.createdAt) },
      ]}
    />
  );
}
