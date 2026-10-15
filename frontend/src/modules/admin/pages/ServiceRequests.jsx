import { Badge } from '@/shared/components/ui/badge';
import ResourcePage from '@/shared/components/ResourcePage';
import { srColumns, useSrTools } from '@/shared/components/SrTools';
import { JOB_TYPES, PRIORITIES, SR_STATUSES, WARRANTY_TYPES } from '@/shared/lib/format';

export default function ServiceRequests() {
  const tools = useSrTools({ verify: true, dispatch: true, assign: true, review: true, cancel: true });
  return (
    <>
      <ResourcePage
        eyebrow="Operations"
        title="Service Requests"
        endpoint="/service-requests"
        filterKey="status"
        filterLabel="All statuses"
        filterOptions={SR_STATUSES}
        columns={[...srColumns(Badge), { key: 'oemName', label: 'OEM' }]}
        rowActions={tools.actions}
        refreshKey={tools.version}
        createLabel="Create Request"
        fields={[
          { name: 'oemId', label: 'OEM', type: 'remote', endpoint: '/companies', params: { type: 'oem', status: 'approved' }, optionLabel: (o) => o.legalName },
          { name: 'brand', label: 'Brand' },
          { name: 'model', label: 'Model' },
          { name: 'serialNumber', label: 'Serial number', required: false },
          { name: 'customerName', label: 'Customer name' },
          { name: 'customerPhone', label: 'Customer phone', required: false },
          { name: 'city', label: 'City' },
          { name: 'jobType', label: 'Job type', type: 'select', options: JOB_TYPES },
          { name: 'warranty', label: 'Warranty', type: 'select', options: WARRANTY_TYPES },
          { name: 'priority', label: 'Priority', type: 'select', options: PRIORITIES },
          { name: 'issue', label: 'Issue', type: 'textarea' },
        ]}
      />
      {tools.dialogs}
    </>
  );
}
