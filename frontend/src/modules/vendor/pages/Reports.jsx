import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { PageShell } from '@/shared/components/PageShell';
import { api } from '@/shared/lib/api';
import { useToast } from '@/shared/context/ToastContext';
import { downloadCsv, humanize } from '@/shared/lib/format';

const REPORTS = [
  {
    name: 'Calls received and assigned', desc: 'Every call with its type, engineer and status', path: '/service-requests?limit=500',
    columns: [['srNumber', 'SR'], ['customerName', 'Customer'], ['brand', 'Brand'], ['city', 'City'], ['engineerName', 'Engineer'], ['origin', 'Call type', (r) => humanize(r.origin)], ['status', 'Status', (r) => humanize(r.status)]],
  },
  {
    name: 'Engineer productivity', desc: 'Roster with certifications and availability', path: '/engineers?limit=500',
    columns: [['name', 'Engineer'], ['city', 'City'], ['certifications', 'Brands', (r) => (r.certifications || []).map((c) => c.brand).join('; ')], ['dayStatus', 'Today'], ['openCalls', 'Open calls'], ['status', 'Approval']],
  },
  {
    name: 'Earnings and settlements', desc: 'Call-wise amounts, approval and payment status', path: '/settlements/payouts?limit=500',
    columns: [['srNumber', 'SR'], ['engineerName', 'Engineer'], ['vendorAmount', 'Call amount'], ['engineerAmount', 'Engineer share'], ['platformFee', 'Platform fee'], ['approval', 'Approval'], ['paymentStatus', 'Payment'], ['txnRef', 'Txn ref']],
  },
  {
    name: 'TAT and quality', desc: 'Open calls with TAT status', path: '/service-requests/sla',
    columns: [['sr', 'SR'], ['customer', 'Customer'], ['priority', 'Priority'], ['due', 'TAT'], ['status', 'Status']],
  },
];

export default function Reports() {
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const run = async (r) => {
    setBusy(r.name);
    try {
      const data = await api(r.path);
      if (!data.items?.length) return toast.error('Nothing to export yet');
      downloadCsv(r.name, r.columns.map(([key, label, csv]) => ({ key, label, csv })), data.items);
    } catch (e) { toast.error(e.message); } finally { setBusy(''); }
  };
  return (
    <PageShell eyebrow="Insights" title="Reports">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map((r) => (
          <Card key={r.name}>
            <CardContent className="flex h-full flex-col justify-between gap-4">
              <div><p className="font-semibold">{r.name}</p><p className="text-sm text-neutral-500">{r.desc}</p></div>
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
