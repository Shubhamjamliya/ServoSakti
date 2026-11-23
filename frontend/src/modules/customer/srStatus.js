// The customer-facing service request lifecycle (SOP section 10, minus the internal billing stages).
// Every customer screen uses these five steps so the Home card, Tracking and History always agree.
import { fmtDateTime } from '@/shared/lib/format';

export const STEPS = [
  { key: 'raised', label: 'Raised', title: 'Request Raised', statuses: ['pending_payment', 'created'] },
  { key: 'verified', label: 'Verified', title: 'Request Verified', statuses: ['verified', 'offered', 'unassigned'] },
  { key: 'assigned', label: 'Assigned', title: 'Engineer Assigned', statuses: ['assigned'] },
  { key: 'progress', label: 'In Progress', title: 'Service In Progress', statuses: ['in_progress'] },
  { key: 'completed', label: 'Completed', title: 'Service Completed', statuses: ['under_review', 'approved', 'closed'] },
];

export const ENDED = ['cancelled', 'failed']; // not steps: shown as a message instead of a progress bar
// a finished request with money still due stays on the tracking screen so it can be paid
export const isActive = (r) => (!ENDED.includes(r.status) && r.status !== 'closed') || r.bill?.due > 0;

/** Index of the current step, or -1 for cancelled/failed. */
export const stepIndex = (status) => STEPS.findIndex((s) => s.statuses.includes(status));
/** True when the current step itself is finished (only the last step can be). */
export const isDone = (status) => ['approved', 'closed'].includes(status);

// What the status pill says, and its colours.
const PILL = {
  pending_payment: ['Awaiting Payment', 'bg-amber-50 text-amber-700'],
  created: ['Request Raised', 'bg-amber-50 text-amber-700'],
  verified: ['Verified', 'bg-sky-50 text-sky-700'],
  offered: ['Finding Engineer', 'bg-sky-50 text-sky-700'],
  unassigned: ['Finding Engineer', 'bg-sky-50 text-sky-700'],
  assigned: ['Engineer Assigned', 'bg-[#e9f0fe] text-[#1456d8]'],
  in_progress: ['In Progress', 'bg-[#e9f0fe] text-[#1456d8]'],
  under_review: ['Under Review', 'bg-violet-50 text-violet-700'],
  approved: ['Completed', 'bg-emerald-50 text-emerald-700'],
  closed: ['Closed', 'bg-emerald-50 text-emerald-700'],
  cancelled: ['Cancelled', 'bg-slate-100 text-slate-600'],
  failed: ['Not Completed', 'bg-red-50 text-red-700'],
};
export const pillOf = (status) => PILL[status] || [status, 'bg-slate-100 text-slate-600'];

const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
/** What the customer must do on a request right now, or null: approve a revised price, or pay. */
export function customerAction(r) {
  if (r.quote?.status === 'pending') return `Approve revised price: ${rupees(r.quote.oldTotal)} → ${rupees(r.quote.newTotal)}`;
  if (r.status === 'pending_payment') return `Pay ${rupees(r.bill?.upfront || r.bill?.due)} to confirm your booking`;
  if (r.bill?.due > 0 && !['created', 'verified', 'offered', 'unassigned', 'assigned'].includes(r.status)) return `${rupees(r.bill.due)} to pay`;
  return null;
}

/** One line under each timeline step on the tracking screen. */
export function stepNote(step, r) {
  const at = stepIndex(r.status);
  const i = STEPS.findIndex((s) => s.key === step.key);
  if (i > at) return null;
  switch (step.key) {
    case 'raised': return r.status === 'pending_payment' ? 'Complete the payment to confirm your booking' : fmtDateTime(r.createdAt);
    case 'verified': return i === at ? (r.status === 'verified' ? 'Warranty and eligibility checked' : 'Finding the nearest available engineer') : 'Warranty and eligibility checked';
    case 'assigned': return r.engineerName ? `${r.engineerName}${r.vendorName ? ` · ${r.vendorName}` : ''}` : r.vendorName || null;
    case 'progress': return i === at ? 'Engineer is working on your product' : r.completedAt ? `Work finished ${fmtDateTime(r.completedAt)}` : 'Work finished';
    case 'completed':
      if (r.status === 'under_review') return 'Work done · final quality check in progress';
      if (r.status === 'approved') return `Approved ${fmtDateTime(r.approvedAt)} · please rate the service`;
      return `Closed ${fmtDateTime(r.closedAt || r.approvedAt)}`;
    default: return null;
  }
}
