import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { PageShell } from '@/shared/components/PageShell';
import { api } from '@/shared/lib/api';
import { useToast } from '@/shared/context/ToastContext';
import { downloadCsv, fmtDate, humanize } from '@/shared/lib/format';

const REPORTS = [
  {
    name: 'Warranty status', desc: 'Warranty records by status and expiry', path: '/products/passports?limit=500',
    columns: [['warrantyNo', 'Warranty No'], ['customerName', 'Customer'], ['brand', 'Brand'], ['model', 'Model'], ['serialNumber', 'Serial'], ['warrantyEnd', 'Warranty ends', (r) => fmtDate(r.warrantyEnd)], ['warrantyStatus', 'Status']],
  },
  {
    name: 'Service volume', desc: 'Requests raised vs closed per month', path: '/service-requests/stats', rows: (d) => d.monthly,
    columns: [['month', 'Month'], ['requests', 'Requests'], ['closed', 'Closed']],
  },
  {
    name: 'SLA breaches', desc: 'Open calls with their TAT status', path: '/service-requests/sla',
    columns: [['sr', 'SR'], ['customer', 'Customer'], ['vendor', 'Service company'], ['priority', 'Priority'], ['due', 'TAT'], ['status', 'Status']],
  },
  {
    name: 'Vendor performance', desc: 'Authorized service companies and coverage', path: '/companies/authorizations?limit=500',
    columns: [['vendorName', 'Service company'], ['vendorCity', 'City'], ['brands', 'Brands', (r) => (r.brands || []).join('; ')], ['cities', 'Cities', (r) => (r.cities || []).join('; ')], ['status', 'Status']],
  },
  {
    name: 'Closure status', desc: 'All service requests and their status', path: '/service-requests?limit=500',
    columns: [['srNumber', 'SR'], ['customerName', 'Customer'], ['brand', 'Brand'], ['model', 'Model'], ['city', 'City'], ['vendorName', 'Service company'], ['engineerName', 'Engineer'], ['status', 'Status', (r) => humanize(r.status)]],
  },
];

export default function Reports() {
  const toast = useToast();
  const [busy, setBusy] = useState('');

  const run = async (r) => {
    setBusy(r.name);
    try {
      const data = await api(r.path);
      const rows = r.rows ? r.rows(data) : data.items;
      if (!rows?.length) return toast.error('Nothing to export yet');
      downloadCsv(r.name, r.columns.map(([key, label, csv]) => ({ key, label, csv })), rows);
    } catch (e) { toast.error(e.message); } finally { setBusy(''); }
  };

  return (
    <PageShell eyebrow="Insights" title="Reports">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map((r) => (
          <Card key={r.name}>
            <CardContent className="flex h-full flex-col justify-between gap-4">
              <div>
                <p className="font-semibold">{r.name}</p>
                <p className="text-sm text-neutral-500">{r.desc}</p>
              </div>
              <Button variant="outline" size="sm" className="self-start" disabled={busy === r.name} onClick={() => run(r)}>
                <Download className="h-4 w-4" /> {busy === r.name ? 'Preparing...' : 'Export CSV'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}
