import { fmtDateTime } from '@/shared/lib/format';

const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

/**
 * One line under a job in the engineer's lists: slot (or URGENT), place, and anything waiting on the job —
 * a revised price the customer has not answered, or money still to collect.
 */
export function jobMeta(j) {
  const parts = [];
  if (j.slot === 'urgent') parts.push('URGENT');
  else if (j.scheduledAt) parts.push(fmtDateTime(j.scheduledAt));
  if (j.subtypeName) parts.push(j.subtypeName);
  parts.push(j.city || '—');
  if (j.quote?.status === 'pending') parts.push('Waiting for customer approval');
  else if (j.bill?.due > 0 && ['in_progress', 'failed'].includes(j.status)) parts.push(`Collect ${rupees(j.bill.due)}`);
  return parts.join(' · ');
}
