import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { AssignDialog, OutsourceDialog, PromptDialog, ReviewDialog, SrDetailDialog } from '@/shared/components/Dialogs';
import { api } from '@/shared/lib/api';
import { useToast } from '@/shared/context/ToastContext';
import { JOB_TYPES, labelOf } from '@/shared/lib/format';

/**
 * Row actions + dialogs shared by every service-request table (admin, OEM, vendor).
 * Which buttons appear depends on the caller's role flags and the row's status.
 */
export function useSrTools({ verify = false, dispatch = false, assign = false, review = false, cancel = false, outsource = false } = {}) {
  const toast = useToast();
  const [detail, setDetail] = useState(null);
  const [reviewId, setReviewId] = useState(null);
  const [assignId, setAssignId] = useState(null);
  const [cancelId, setCancelId] = useState(null);
  const [outsourceId, setOutsourceId] = useState(null);
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);

  const run = async (fn, okMsg) => {
    try { await fn(); toast.success(okMsg); bump(); } catch (e) { toast.error(e.message); }
  };

  const actions = ({ row }) => (
    <>
      <Button size="sm" variant="ghost" onClick={() => setDetail(row._id)}>View</Button>
      {verify && row.status === 'created' && (
        <Button size="sm" variant="secondary" onClick={() => run(() => api(`/service-requests/${row._id}/verify`, { method: 'PATCH', body: {} }), 'Verified — dispatch started')}>Verify</Button>
      )}
      {dispatch && ['verified', 'unassigned'].includes(row.status) && (
        <Button size="sm" variant="secondary" onClick={() => run(() => api(`/dispatch/${row._id}/start`, { method: 'POST' }), 'Dispatch started')}>Dispatch</Button>
      )}
      {assign && ['verified', 'offered', 'unassigned', 'assigned'].includes(row.status) && (
        <Button size="sm" variant="outline" onClick={() => setAssignId(row._id)}>Assign</Button>
      )}
      {outsource && ['verified', 'offered', 'unassigned'].includes(row.status) && (
        <Button size="sm" variant="outline" onClick={() => setOutsourceId(row._id)}>Outsource</Button>
      )}
      {review && row.status === 'under_review' && <Button size="sm" onClick={() => setReviewId(row._id)}>Review</Button>}
      {cancel && ['created', 'verified', 'offered', 'unassigned', 'assigned'].includes(row.status) && (
        <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setCancelId(row._id)}>Cancel</Button>
      )}
    </>
  );

  const dialogs = (
    <>
      <SrDetailDialog srId={detail} onClose={() => setDetail(null)} />
      <ReviewDialog srId={reviewId} onClose={() => setReviewId(null)} onDone={bump} />
      <OutsourceDialog srId={outsourceId} onClose={() => setOutsourceId(null)} onDone={bump} />
      <AssignDialog srId={assignId} onClose={() => setAssignId(null)} onDone={bump} />
      <PromptDialog
        open={!!cancelId} onOpenChange={(o) => !o && setCancelId(null)} title="Cancel service request" label="Reason" required destructive confirmLabel="Cancel request"
        onConfirm={async (reason) => { await api(`/service-requests/${cancelId}/cancel`, { method: 'PATCH', body: { reason } }); toast.success('Request cancelled'); bump(); }}
      />
    </>
  );

  return { actions, dialogs, version };
}

export const srColumns = (Badge) => [
  { key: 'srNumber', label: 'SR' },
  { key: 'customerName', label: 'Customer' },
  { key: 'model', label: 'Product', render: (r) => [r.brand, r.model].filter(Boolean).join(' ') },
  { key: 'city', label: 'City' },
  { key: 'jobType', label: 'Job', render: (r) => labelOf(JOB_TYPES, r.jobType), csv: (r) => labelOf(JOB_TYPES, r.jobType) },
  { key: 'priority', label: 'Priority', render: (r) => <Badge>{r.priority}</Badge> },
  { key: 'vendorName', label: 'Service co.' },
  { key: 'engineerName', label: 'Engineer' },
  { key: 'status', label: 'Status', render: (r) => <Badge>{r.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</Badge> },
];
