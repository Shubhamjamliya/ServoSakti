import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, CalendarDays, CheckCircle2, ChevronRight, ClipboardList, Package, Wrench } from 'lucide-react';
import { useApi } from '@/shared/lib/useApi';
import { useBranding } from '@/shared/lib/useBranding';
import { useAuth } from '@/shared/context/AuthContext';
import { fmtDate } from '@/shared/lib/format';
import { cn, inr } from '@/shared/lib/utils';
import { resolveHome } from '../homeDefaults.js';
import { isActive, customerAction } from '../srStatus.js';
import { EngineerRow, SrPill, StepBar } from '../components/SrParts.jsx';
import { resolveProductImage } from '@/shared/lib/productImages';

const WARRANTY_PILL = {
  'In Warranty': ['Under Warranty', 'bg-[#e8f7ee] text-[#137a43]', 'text-[#1f9d55]'],
  'Expiring Soon': ['Expiring Soon', 'bg-amber-50 text-amber-700', 'text-amber-500'],
  Expired: ['Warranty Expired', 'bg-red-50 text-red-700', 'text-red-500'],
  Unknown: ['Warranty Unknown', 'bg-slate-100 text-slate-600', 'text-slate-400'],
};

const matches = (q, ...fields) => !q || fields.some((f) => String(f || '').toLowerCase().includes(q));

function Hero({ banners }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (banners.length < 2) return undefined;
    const t = setInterval(() => setI((n) => (n + 1) % banners.length), 5000);
    return () => clearInterval(t);
  }, [banners.length]);
  const b = banners[i % banners.length];
  return (
    <section>
      <div className="relative aspect-[2/1] w-full overflow-hidden rounded-[22px] bg-[#eef4ff] shadow-sm">
        {b?.image && (
          <img
            key={b.image}
            src={b.image}
            alt=""
            className="h-full w-full object-cover"
          />
        )}
      </div>
      {banners.length > 1 && (
        <div className="mt-2.5 flex justify-center gap-1.5">
          {banners.map((_, n) => (
            <button
              key={n}
              onClick={() => setI(n)}
              aria-label={`Banner ${n + 1}`}
              className={cn('h-2 w-2 rounded-full transition-colors', n === i ? 'bg-[#1456d8]' : 'bg-[#d3dcea]')}
            />
          ))}
        </div>
      )}
    </section>
  );
}

const SectionHead = ({ title, to, label = 'View All' }) => (
  <div className="mb-3 flex items-center justify-between">
    <h3 className="text-[19px] font-bold text-[#0b1324]">{title}</h3>
    {to && <Link to={to} className="flex items-center gap-0.5 text-[14px] font-semibold text-[#1456d8]">{label}<ChevronRight className="h-4 w-4" strokeWidth={2.4} /></Link>}
  </div>
);

const Card = ({ to, className, children }) => (
  <Link to={to} className={cn('block rounded-[18px] border border-[#e6ebf3] bg-white shadow-[0_2px_10px_rgba(15,35,80,0.04)] transition active:scale-[0.99]', className)}>{children}</Link>
);

const EmptyCard = ({ icon: Icon, text, cta, to }) => (
  <div className="rounded-[18px] border border-dashed border-[#d7deea] bg-white px-4 py-8 text-center">
    <Icon className="mx-auto h-8 w-8 text-[#9aa5b8]" strokeWidth={1.6} />
    <p className="mt-2 text-[13px] text-[#5d667a]">{text}</p>
    {cta && <Link to={to} className="mt-2 inline-block text-[13px] font-semibold text-[#1456d8]">{cta}</Link>}
  </div>
);

const Skeleton = ({ className }) => <div className={cn('animate-pulse rounded-[18px] bg-[#e8eef8]', className)} />;

function ProductCard({ p }) {
  const [label, pill, icon] = WARRANTY_PILL[p.warrantyStatus] || WARRANTY_PILL.Unknown;
  const imgSrc = resolveProductImage(p);
  return (
    <Card to="/customer/product-passport" className="flex items-center gap-3.5 p-3.5">
      <div className="flex h-[66px] w-[86px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#edf2f9] bg-[#f8fafc] p-1">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt=""
            className="h-full w-full object-contain"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <Package className="h-7 w-7 text-[#9aa5b8]" strokeWidth={1.6} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15.5px] font-bold text-[#0b1324]">{p.model || p.brand || 'Product'}</p>
        <p className="truncate text-[12px] font-medium text-[#5d667a]">
          {p.brand && <>Brand: {p.brand}</>}{p.brand && p.serialNumber && <span className="mx-1.5 text-[#cfd6e2]">|</span>}{p.serialNumber && <>Serial: {p.serialNumber}</>}
        </p>
        <span className={cn('mt-1.5 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11.5px] font-semibold', pill)}>
          <CheckCircle2 className={cn('h-3.5 w-3.5', icon)} fill="currentColor" stroke="white" />{label}
        </span>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-[#8a94a6]" />
    </Card>
  );
}

/** One active request: header, product line, engineer row and the 5-step progress. */
function RequestCard({ r }) {
  return (
    <Card to={`/customer/tracking#${r._id}`} className="overflow-hidden">
      <div className="flex gap-3 p-3.5 pb-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#e9f0fe] text-[#1456d8]"><Wrench className="h-5 w-5" strokeWidth={1.9} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[15.5px] font-bold text-[#0b1324]">SR #{String(r.srNumber).replace(/^SR-/, '')}</p>
            <SrPill status={r.status} />
          </div>
          <p className="mt-0.5 truncate text-[12.5px] text-[#4a5263]">{[r.model || r.brand, r.issue].filter(Boolean).join(' – ')}</p>
          <p className="mt-1 flex items-center gap-1.5 text-[11.5px] text-[#5d667a]"><CalendarDays className="h-3.5 w-3.5" />Created: {fmtDate(r.createdAt)}</p>
        </div>
      </div>
      {customerAction(r) && <p className="mx-3.5 mb-2.5 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-800">{customerAction(r)} · tap to open</p>}
      <div className="mx-3.5 border-t border-[#eef1f6] py-2.5"><EngineerRow r={r} /></div>
      <div className="border-t border-[#eef1f6] bg-[#fafbfe] px-2 pb-3 pt-3"><StepBar status={r.status} /></div>
    </Card>
  );
}

export default function Home() {
  const { user } = useAuth();
  const branding = useBranding();
  const home = resolveHome(branding?.customerHome);
  const q = (useSearchParams()[0].get('q') || '').toLowerCase();
  const { data: reqs, loading: loadingReqs } = useApi('/service-requests?limit=50');
  const { data: passports, loading: loadingProducts } = useApi('/products/passports?limit=50');

  const { data: refunds } = useApi('/refunds?status=awaiting_customer&limit=20');
  const waitingRefund = (refunds?.items || []).reduce((t, r) => t + r.amount, 0);
  const allProducts = passports?.items || [];
  const products = allProducts.filter((p) => matches(q, p.brand, p.model, p.serialNumber, p.warrantyNo));
  const active = (reqs?.items || []).filter((r) => isActive(r) && matches(q, r.srNumber, r.brand, r.model, r.issue));

  return (
    <div className="space-y-5">
      {!q && (
        <>
          <div>
            <h1 className="text-[26px] font-bold leading-tight text-[#0b1324]">Hello, {user?.name?.split(' ')[0] || 'there'} <span className="inline-block">👋</span></h1>
            <p className="mt-1 max-w-[340px] text-[15px] leading-snug text-[#4a5263]">{home.subtitle}</p>
          </div>

          {waitingRefund > 0 && (
            <Link to="/customer/wallet" className="flex items-center justify-between gap-3 rounded-[18px] border border-amber-300 bg-amber-50 px-3.5 py-3">
              <span className="text-[13px] text-[#0b1324]"><b>{inr(waitingRefund)}</b> refund is waiting. Choose wallet or original payment.</span>
              <ArrowRight className="h-4 w-4 shrink-0 text-amber-700" />
            </Link>
          )}

          <Hero banners={home.banners} />

          <section className="grid grid-cols-4 gap-2.5">
            {home.quick.map((a) => (
              <Link key={a.key} to={a.to} style={{ background: a.tile }} className="flex flex-col items-center gap-2 rounded-[18px] px-1 pb-3 pt-3.5 text-center ring-1 ring-black/[0.03] transition active:scale-95">
                <img src={a.image} alt="" className="h-11 w-11 object-contain" />
                <span className="text-[11.5px] font-semibold leading-[1.25] tracking-[-0.01em] text-[#0b1324]">{a.label}</span>
              </Link>
            ))}
          </section>

          <section className="flex items-center gap-3 rounded-[20px] bg-gradient-to-r from-[#1456d8] to-[#1d63e6] px-3.5 py-4 text-white shadow-[0_8px_20px_rgba(20,86,216,0.25)]">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white">
              <img src={branding?.customerLogo || branding?.logo || '/images/aftenza-mark.png'} alt="" className="h-7 w-7 object-contain" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="whitespace-nowrap text-[16px] font-bold leading-tight min-[400px]:text-[17px]">Need a Service?</h3>
              <p className="text-[11px] leading-snug text-blue-100">Create a service request for your product</p>
            </div>
            <Link to="/customer/service-requests" className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-3 py-2.5 text-[12.5px] font-bold text-[#0b1324]">Raise Request<ArrowRight className="h-4 w-4" strokeWidth={2.4} /></Link>
          </section>

        </>
      )}

      <section>
        <SectionHead title="My Products" to="/customer/product-passport" />
        <div className="space-y-3">
          {loadingProducts && <Skeleton className="h-[92px]" />}
          {!loadingProducts && products.length === 0 && (
            q ? <EmptyCard icon={Package} text="No products match your search." />
              : <EmptyCard icon={Package} text="No products registered yet." cta="Register your product" to="/customer/product-passport" />
          )}
          {products.slice(0, q ? 20 : 2).map((p) => <ProductCard key={p._id} p={p} />)}
        </div>
      </section>

      <section>
        <SectionHead title={active.length > 1 ? 'Active Service Requests' : 'Active Service Request'} to={active.length > 2 ? '/customer/tracking' : undefined} />
        <div className="space-y-3">
          {loadingReqs && <Skeleton className="h-[170px]" />}
          {!loadingReqs && active.length === 0 && <EmptyCard icon={ClipboardList} text={q ? 'No requests match your search.' : 'No active service requests.'} cta={q ? null : 'Raise a request'} to="/customer/service-requests" />}
          {active.slice(0, q ? 20 : 2).map((r) => <RequestCard key={r._id} r={r} />)}
        </div>
      </section>
    </div>
  );
}
