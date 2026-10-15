import * as Dd from '@radix-ui/react-dropdown-menu';
import { cn } from '@/shared/lib/utils';

export const DropdownMenu = Dd.Root;
export const DropdownMenuTrigger = Dd.Trigger;
export const DropdownMenuGroup = Dd.Group;

export const DropdownMenuContent = ({ className, sideOffset = 8, ...props }) => (
  <Dd.Portal>
    <Dd.Content
      sideOffset={sideOffset}
      align="end"
      className={cn('z-[70] min-w-52 rounded-xl border bg-white p-1.5 shadow-xl', className)}
      {...props}
    />
  </Dd.Portal>
);
export const DropdownMenuItem = ({ className, ...props }) => (
  <Dd.Item
    className={cn('flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-muted', className)}
    {...props}
  />
);
export const DropdownMenuSeparator = ({ className, ...props }) => (
  <Dd.Separator className={cn('my-1 h-px bg-neutral-200', className)} {...props} />
);
