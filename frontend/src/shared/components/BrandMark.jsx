import { BRAND } from '@/shared/constants/sidebarMenus';
import { useBranding } from '@/shared/lib/useBranding';
import { cn } from '@/shared/lib/utils';

// Which Business Setup logo each portal shows.
const LOGO_FIELD = { admin: 'logo', oem: 'oemLogo', vendor_owner: 'vendorLogo', engineer: 'engineerLogo', customer: 'customerLogo' };

/** Square logo (falls back to the main logo, then the letter mark) + the company name from Business Setup. */
export function useBrand(role) {
  const b = useBranding();
  return { name: b?.companyName || BRAND.name, logo: b?.[LOGO_FIELD[role]] || b?.logo || null };
}

export default function BrandMark({ role, className }) {
  const { name, logo } = useBrand(role);
  return logo
    ? <img src={logo} alt={name} className={cn('h-10 w-10 rounded-lg bg-white object-contain', className)} />
    : <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg bg-primary font-bold text-white', className)}>{BRAND.short}</div>;
}
