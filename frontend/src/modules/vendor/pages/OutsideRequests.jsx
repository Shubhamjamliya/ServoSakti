import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { AcceptOfferDialog, PromptDialog } from '@/shared/components/Dialogs';
import ResourcePage from '@/shared/components/ResourcePage';
import { srColumns, useSrTools } from '@/shared/components/SrTools';
import Tabs from '@/shared/components/Tabs';
import { api } from '@/shared/lib/api';
import { useAuth } from '@/shared/context/AuthContext';
import { useToast } from '@/shared/context/ToastContext';
import { fmtDateTime, labelOf, JOB_TYPES } from '@/shared/lib/format';

const TABS = [
  { value: 'incoming', label: 'Requests to us' },
  { value: 'outsourced', label: 'Outsourced & partner jobs' },
];

function Incoming() {
  const toast = useToast();
  const [accepting, setAccepting] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);
  return (
    <>
      <ResourcePage
        eyebrow="Calls"
        title="Outside Requests"
        endpoint="/dispatch/offers"
        searchable={false}
        refreshKey={version}
        columns={[
          { key: 'srNumber', label: 'SR' },
          { key: 'sr', label: 'Product', render: (r) => [r.sr?.brand, r.sr?.model].filter(Boolean).join(' '), csv: (r) => r.sr?.brand },
          { key: 'city', label: 'City', render: (r) => r.sr?.city, csv: (r) => r.sr?.city },
          { key: 'job', label: 'Job', render: (r) => labelOf(JOB_TYPES, r.sr?.jobType), csv: (r) => r.sr?.jobType },
          { key: 'priority', label: 'Priority', render: (r) => <Badge>{r.sr?.priority}</Badge> },
          { key: 'expiresAt', label: 'Respond by', render: (r) => fmtDateTime(r.expiresAt), csv: (r) => fmtDateTime(r.expiresAt) },
        ]}
        rowActions={({ row }) => (
          <>
            <Button size="sm" onClick={() => setAccepting(row)}>Accept</Button>
            <Button size="sm" variant="outline" className="text-red-600" onClick={() => setRejecting(row)}>Decline</Button>
          </>
        )}
      />
      <AcceptOfferDialog offer={accepting} onClose={() => setAccepting(null)} onDone={bump} />
      <PromptDialog
        open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)} title={`Decline ${rejecting?.srNumber}`} label="Reason" required destructive confirmLabel="Decline"
        onConfirm={async (reason) => { await api(`/dispatch/offers/${rejecting._id}/reject`, { method: 'POST', body: { reason } }); toast.success('Declined'); bump(); }}
      />
    </>
  );
}

function Outsourced() {
  const { user } = useAuth();
  const tools = useSrTools({ assign: true, review: true });
  return (
    <>
      <ResourcePage
        eyebrow="Calls"
        title="Outside Requests"
        endpoint="/service-requests"
        params={{ outsourced: '1' }}
        columns={[
          { key: 'direction', label: 'Direction', render: (r) => <Badge tone="blue">{r.outsourcedBy === user.companyId ? 'Handed to partner' : 'Partner job for us'}</Badge>, csv: (r) => (r.outsourcedBy === user.companyId ? 'Handed to partner' : 'Partner job') },
          ...srColumns(Badge),
        ]}
        rowActions={tools.actions}
        refreshKey={tools.version}
      />
      {tools.dialogs}
    </>
  );
}

export default function OutsideRequests() {
  const [tab, setTab] = useState('incoming');
  return (
    <div>
      <div className="px-4 pt-4 lg:px-6"><Tabs tabs={TABS} value={tab} onChange={setTab} /></div>
      {tab === 'incoming' ? <Incoming /> : <Outsourced />}
    </div>
  );
}
