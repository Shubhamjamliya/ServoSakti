export const humanize = (s) => String(s ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

export const JOB_TYPES = [
  { value: 'pm', label: 'PM' },
  { value: 'breakdown', label: 'Breakdown' },
  { value: 'installation', label: 'Installation' },
  { value: 'other', label: 'Other' },
];
export const WARRANTY_TYPES = [
  { value: 'warranty', label: 'Warranty' },
  { value: 'non_warranty', label: 'Non-warranty' },
];
export const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
export const SR_STATUSES = ['created', 'verified', 'offered', 'unassigned', 'assigned', 'in_progress', 'under_review', 'approved', 'closed', 'cancelled'].map((v) => ({ value: v, label: humanize(v) }));

export const labelOf = (list, value) => list.find((o) => o.value === value)?.label || humanize(value);

export const downloadCsv = (name, columns, rows) => {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [columns.map((c) => esc(c.label)), ...rows.map((r) => columns.map((c) => esc(c.csv ? c.csv(r) : r[c.key])))].map((l) => l.join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  Object.assign(document.createElement('a'), { href: url, download: `${name.toLowerCase().replace(/\s+/g, '-')}.csv` }).click();
  URL.revokeObjectURL(url);
};
