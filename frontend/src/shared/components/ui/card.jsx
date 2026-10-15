import { cn } from '@/shared/lib/utils';

export const Card = ({ className, ...props }) => (
  <div className={cn('rounded-2xl border border-neutral-200 bg-card text-card-foreground shadow-sm', className)} {...props} />
);
export const CardHeader = ({ className, ...props }) => (
  <div className={cn('flex flex-col gap-1 px-5 pt-5', className)} {...props} />
);
export const CardTitle = ({ className, ...props }) => (
  <h3 className={cn('text-base font-semibold text-neutral-900', className)} {...props} />
);
export const CardContent = ({ className, ...props }) => <div className={cn('px-5 py-4', className)} {...props} />;
