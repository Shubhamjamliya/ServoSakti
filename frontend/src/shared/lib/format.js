export const humanize = (s) => String(s ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
/** "142 days left" / "Expires today" / "Expired 12 days ago" from the API's warrantyDaysLeft. */
export const daysLeftText = (d) => {
  if (d == null) return '—';
  if (d === 0) return 'Expires today';
  const n = Math.abs(d);
  const unit = n === 1 ? 'day' : 'days';
  return d > 0 ? `${n} ${unit} left` : `Expired ${n} ${unit} ago`;
};
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

export const JOB_TYPES = [
  { value: 'pm', label: 'PM (servicing)' },
  { value: 'breakdown', label: 'Breakdown repair' },
  { value: 'installation', label: 'Installation' },
  { value: 'uninstallation', label: 'Uninstallation' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'other', label: 'Other' },
];
export const WARRANTY_TYPES = [
  { value: 'warranty', label: 'Warranty' },
  { value: 'non_warranty', label: 'Non-warranty' },
];
/** Payout rate cards can also be set per AMC / CMC job. */
export const PAYOUT_COVERAGE = [...WARRANTY_TYPES, { value: 'amc', label: 'AMC' }, { value: 'cmc', label: 'CMC' }];
export const COVERAGE = {
  none: { label: 'Not covered', tone: 'bg-slate-100 text-slate-700' },
  warranty: { label: 'Under OEM warranty', tone: 'bg-emerald-50 text-emerald-700' },
  amc: { label: 'AMC active', tone: 'bg-sky-50 text-sky-700' },
  cmc: { label: 'CMC active', tone: 'bg-violet-50 text-violet-700' },
};
export const SLOTS = [
  { value: 'scheduled', label: 'Schedule', hint: 'Tomorrow or later' },
  { value: 'same_day', label: 'Today', hint: 'Same-day slot' },
  { value: 'urgent', label: 'Urgent', hint: 'Within 3 hours' },
];
export const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
export const SR_STATUSES = ['pending_payment', 'created', 'verified', 'offered', 'unassigned', 'assigned', 'in_progress', 'under_review', 'approved', 'closed', 'cancelled', 'failed']
  .map((v) => ({ value: v, label: v === 'pending_payment' ? 'Awaiting Payment' : humanize(v) }));
export const PAYMENT_STATUSES = [
  { value: 'not_required', label: 'Nothing to pay' },
  { value: 'pending', label: 'Unpaid' },
  { value: 'partial', label: 'Part paid' },
  { value: 'paid', label: 'Paid' },
];
export const PAYMENT_MODES = { prepaid: 'Prepaid (online)', postpaid: 'Pay after service' };
export const QUOTE_STATUSES = { pending: 'Waiting for customer', approved: 'Approved by customer', rejected: 'Rejected by customer', expired: 'Expired (no answer)', applied: 'Applied automatically (lower)' };
/** Visit slot in words: "Urgent (within 3 hours)" or the scheduled date and time. */
export const slotText = (r) => (r.slot === 'urgent' ? 'Urgent (within 3 hours)' : r.scheduledAt ? `${r.slot === 'same_day' ? 'Today · ' : ''}${fmtDateTime(r.scheduledAt)}` : '—');

export const labelOf = (list, value) => list.find((o) => o.value === value)?.label || humanize(value);

export const downloadCsv = (name, columns, rows) => {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [columns.map((c) => esc(c.label)), ...rows.map((r) => columns.map((c) => esc(c.csv ? c.csv(r) : r[c.key])))].map((l) => l.join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  Object.assign(document.createElement('a'), { href: url, download: `${name.toLowerCase().replace(/\s+/g, '-')}.csv` }).click();
  URL.revokeObjectURL(url);
};
