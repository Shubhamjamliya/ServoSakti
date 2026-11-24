import { Link } from 'react-router-dom';
import { BellRing, VolumeX } from 'lucide-react';
import { useOfferRing } from '@/shared/lib/useOfferRing';
import { cn } from '@/shared/lib/utils';

/**
 * Floating "incoming job" bar that rings until the offer is handled. Engineer app and service company panel.
 *   to        where the offers are answered
 *   floating  bottom-of-screen bar (mobile app) instead of a top strip (desktop panel)
 */
export default function OfferRingBanner({ to, floating = false, label = 'New job offer' }) {
  const { waiting, silence, unlocked } = useOfferRing();
  if (!waiting.length) return null;
  return (
    <div className={cn('z-40 flex items-center gap-3 border border-amber-300 bg-amber-50 px-3 py-2.5 text-amber-900 shadow-lg',
      floating ? 'fixed bottom-20 left-1/2 w-[calc(100%-2rem)] max-w-[448px] -translate-x-1/2 rounded-2xl' : 'mx-4 mt-3 rounded-xl lg:mx-6')}>
      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400 text-white">
        <BellRing className="h-5 w-5 animate-bounce" />
        <span className="absolute inset-0 animate-ping rounded-xl bg-amber-400/40" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-bold">{waiting.length > 1 ? `${waiting.length} ${label.toLowerCase()}s` : label}: {waiting[0].srNumber}</p>
        <p className="truncate text-[11.5px]">{unlocked ? 'Accept or decline before it moves to someone else' : 'Tap anywhere to turn the ring sound on'}</p>
      </div>
      <Link to={to} className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-[12px] font-bold text-white">Open</Link>
      <button type="button" onClick={silence} aria-label="Silence" className="shrink-0 rounded-lg p-1.5 text-amber-800 hover:bg-amber-100"><VolumeX className="h-4 w-4" /></button>
    </div>
  );
}
