import { cn } from '@/shared/lib/utils';

const TONES = {
  green: 'bg-green-50 text-green-700 ring-green-600/20',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  blue: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  gray: 'bg-neutral-100 text-neutral-700 ring-neutral-500/20',
};

// Maps common status words to a colour so tables stay consistent across panels.
const AUTO = {
  completed: 'green', approved: 'green', active: 'green', closed: 'green', 'in warranty': 'green', paid: 'green', 'on track': 'green', eligible: 'green', issued: 'blue', registered: 'green', accepted: 'green', assigned: 'blue',
  'in progress': 'blue', open: 'blue', verified: 'blue', offered: 'blue', queued: 'blue',
  pending: 'amber', 'under review': 'amber', 'at risk': 'amber', 'expiring soon': 'amber', created: 'amber', medium: 'amber',
  rejected: 'red', breached: 'red', expired: 'red', suspended: 'red', high: 'red', urgent: 'red', 'out of warranty': 'red', timeout: 'red', failed: 'red', unassigned: 'red', unpaid: 'amber', held: 'amber', cancelled: 'gray', escalated: 'red', draft: 'gray', confirmed: 'blue',
  low: 'gray', inactive: 'gray',
};

export function Badge({ children, tone, className }) {
  const t = tone || AUTO[String(children).toLowerCase()] || 'gray';
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', TONES[t], className)}>
      {children}
    </span>
  );
}
