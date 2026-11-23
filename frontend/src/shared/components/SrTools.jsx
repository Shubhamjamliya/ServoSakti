import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { AssignDialog, OutsourceDialog, PromptDialog, ReviewDialog, SrDetailDialog } from '@/shared/components/Dialogs';
import { api } from '@/shared/lib/api';
import { useToast } from '@/shared/context/ToastContext';
import { COVERAGE, JOB_TYPES, PAYMENT_STATUSES, SR_STATUSES, fmtDateTime, labelOf, slotText } from '@/shared/lib/format';
import { inr } from '@/shared/lib/utils';

/**
 * Row actions + dialogs shared by every service-request table (admin, OEM, vendor).
 * Which buttons appear depends on the caller's role flags and the row's status.
 */
export function useSrTools({ verify = false, dispatch = false, assign = false, review = false, cancel = false, outsource = false, fail = false } = {}) {
  const toast = useToast();
  const [detail, setDetail] = useState(null);
  const [reviewId, setReviewId] = useState(null);
  const [assignId, setAssignId] = useState(null);
  const [cancelId, setCancelId] = useState(null);
  const [outsourceId, setOutsourceId] = useState(null);
  const [failId, setFailId] = useState(null);
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
      {fail && ['assigned', 'in_progress', 'under_review'].includes(row.status) && (
        <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setFailId(row._id)}>Mark failed</Button>
      )}
      {cancel && ['pending_payment', 'created', 'verified', 'offered', 'unassigned', 'assigned'].includes(row.status) && (
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
      <PromptDialog
        open={!!failId} onOpenChange={(o) => !o && setFailId(null)} title="Mark call as failed" label="Reason (e.g. customer not available)" required destructive confirmLabel="Mark failed"
        description="Payment for failed calls follows the policy set in Admin → Settings."
        onConfirm={async (reason) => { await api(`/field/${failId}/fail`, { method: 'PATCH', body: { reason } }); toast.success('Call marked failed'); bump(); }}
      />
    </>
  );

  return { actions, dialogs, version };
}

export const srColumns = (Badge) => [
  { key: 'srNumber', label: 'SR' },
  { key: 'customerName', label: 'Customer' },
  { key: 'model', label: 'Product', render: (r) => <span>{[r.brand, r.model].filter(Boolean).join(' ')}{r.subtypeName && <span className="block text-[11px] text-neutral-500">{r.subtypeName}</span>}</span>, csv: (r) => [r.brand, r.model, r.subtypeName].filter(Boolean).join(' ') },
  { key: 'city', label: 'City' },
  { key: 'jobType', label: 'Job', render: (r) => labelOf(JOB_TYPES, r.jobType), csv: (r) => labelOf(JOB_TYPES, r.jobType) },
  { key: 'slot', label: 'Slot', render: (r) => (r.slot === 'urgent' ? <Badge tone="red">Urgent</Badge> : r.scheduledAt ? fmtDateTime(r.scheduledAt) : <Badge>{r.priority}</Badge>), csv: (r) => slotText(r) },
  { key: 'coverage', label: 'Coverage', render: (r) => <Badge tone={r.coverage && r.coverage !== 'none' ? 'green' : 'gray'}>{COVERAGE[r.coverage || 'none'].label}</Badge>, csv: (r) => COVERAGE[r.coverage || 'none'].label },
  { key: 'amount', label: 'Amount', render: (r) => (r.bill ? <span>{inr(r.bill.total)}{r.bill.due > 0 && <span className="block text-[11px] font-semibold text-red-600">Due {inr(r.bill.due)}</span>}</span> : '—'), csv: (r) => r.bill?.total ?? '' },
  { key: 'paymentStatus', label: 'Payment', render: (r) => (r.bill ? <Badge>{labelOf(PAYMENT_STATUSES, r.paymentStatus)}</Badge> : '—'), csv: (r) => (r.bill ? labelOf(PAYMENT_STATUSES, r.paymentStatus) : '') },
  { key: 'vendorName', label: 'Service co.' },
  { key: 'engineerName', label: 'Engineer' },
  {
    key: 'status', label: 'Status', csv: (r) => labelOf(SR_STATUSES, r.status),
    render: (r) => (
      <span className="flex flex-col items-start gap-1">
        <Badge>{labelOf(SR_STATUSES, r.status)}</Badge>
        {r.quote?.status === 'pending' && <Badge tone="amber">Price approval pending</Badge>}
        {r.flags?.length > 0 && <Badge tone="red">Flagged</Badge>}
      </span>
    ),
  },
];
