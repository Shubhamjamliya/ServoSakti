import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@/shared/lib/utils';

export const Label = ({ className, ...props }) => (
  <LabelPrimitive.Root className={cn('text-xs font-semibold uppercase tracking-wide text-neutral-600', className)} {...props} />
);
