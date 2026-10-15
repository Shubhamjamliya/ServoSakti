import { cn } from '@/shared/lib/utils';

const base =
  'w-full rounded-lg border border-input bg-white px-3 text-sm outline-none transition placeholder:text-neutral-400 focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50';

export const Input = ({ className, ...props }) => <input className={cn(base, 'h-9', className)} {...props} />;
export const Textarea = ({ className, ...props }) => <textarea className={cn(base, 'min-h-20 py-2', className)} {...props} />;
export const NativeSelect = ({ className, children, ...props }) => (
  <select className={cn(base, 'h-9 pr-8', className)} {...props}>{children}</select>
);
