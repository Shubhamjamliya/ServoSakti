import * as P from '@radix-ui/react-popover';
import { cn } from '@/shared/lib/utils';

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;

export const PopoverContent = ({ className, sideOffset = 8, ...props }) => (
  <P.Portal>
    <P.Content
      sideOffset={sideOffset}
      align="end"
      className={cn('z-[70] w-80 rounded-xl border bg-white p-0 shadow-xl outline-none', className)}
      {...props}
    />
  </P.Portal>
);
