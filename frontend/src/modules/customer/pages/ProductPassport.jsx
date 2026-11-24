import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  Filter,
  Package,
  Plus,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Upload,
  Wrench,
  XCircle,
} from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input, NativeSelect } from '@/shared/components/ui/input';
import { Empty, ErrorNote, Field, Screen } from '@/shared/components/Mobile';
import { api, uploadFiles } from '@/shared/lib/api';
import { useApi } from '@/shared/lib/useApi';
import { useToast } from '@/shared/context/ToastContext';
import { daysLeftText, fmtDate } from '@/shared/lib/format';
import { cn, inr } from '@/shared/lib/utils';
import { payWith } from '@/shared/lib/razorpay';
import { InvoiceButton } from '../components/MoneyParts.jsx';
import { resolveProductImage, WARRANTY_CONFIG } from '@/shared/lib/productImages';

const EMPTY = { productId: '', subtypeId: '', brand: '', model: '', serialNumber: '', purchaseDate: '', warrantyEnd: '', invoiceUrl: '' };

const matches = (q, ...fields) => !q || fields.some((f) => String(f || '').toLowerCase().includes(q));

const WARRANTY_NOTE = {
  pending: ['Warranty verification pending — our team is checking your invoice', 'bg-amber-50 text-amber-800'],
  rejected: ['Warranty not approved — service is charged as non-warranty', 'bg-red-50 text-red-700'],
};

/** AMC / CMC for one product: the active plan (with cancel) and the plans that can be bought. */
function PlansPanel({ p }) {
  const toast = useToast();
  const offers = useApi(`/plans/offers?passportId=${p._id}`);
  const subs = useApi(`/plans/subscriptions?passportId=${p._id}&status=active`);
  const [busy, setBusy] = useState('');
  const buy = async (plan) => {
    setBusy(plan._id);
    try {
      const r = await api('/plans/subscribe', { method: 'POST', body: { planId: plan._id, passportId: p._id } });
      if (r.payment) await payWith(r.payment);
      toast.success(`${plan.type.toUpperCase()} activated`);
      subs.reload(); offers.reload();
    } catch (e) { toast.error(e.message); } finally { setBusy(''); }
  };
  const cancel = async (s) => {
    if (!window.confirm('Cancel this plan? Full refund within 7 days if no visit was used, otherwise a pro-rata refund. You choose wallet or original payment in Wallet & refunds.')) return;
    try { await api(`/plans/subscriptions/${s._id}/cancel`, { method: 'POST', body: {} }); toast.success('Plan cancelled. Choose where to get the refund in Wallet & refunds.'); subs.reload(); offers.reload(); } catch (e) { toast.error(e.message); }
  };
  return (
    <div className="space-y-2 pt-2">
      {(subs.data?.items || []).map((s) => (
        <div key={s._id} className="rounded-xl border border-sky-200 bg-sky-50 p-2.5">
          <p className="text-[12.5px] font-bold text-[#0b1324]">{s.planName} · active till {fmtDate(s.endDate)}</p>
          <p className="text-[11.5px] text-[#475467]">PM visits left: {s.pmVisitsLeft} of {s.pmVisitsTotal} · Breakdown cover from {fmtDate(s.breakdownFrom)}</p>
          <div className="mt-1 flex items-center gap-4">
            <InvoiceButton path={`/plans/subscriptions/${s._id}/invoice`} filename={`Plan-invoice-${s._id}.pdf`} className="text-[11.5px]" label="Invoice" />
            <button type="button" onClick={() => cancel(s)} className="text-[11.5px] font-semibold text-red-700">Cancel plan</button>
          </div>
        </div>
      ))}
      {offers.data?.message && <p className="text-[11.5px] text-[#5d667a]">{offers.data.message}</p>}
      {(offers.data?.items || []).map((o) => (
        <div key={o._id} className="flex items-center justify-between gap-2 rounded-xl border border-[#e2e8f0] bg-white p-2.5">
          <div className="min-w-0">
            <p className="text-[12.5px] font-bold text-[#0b1324]">{o.name} <span className="font-normal text-[#5d667a]">({o.type === 'amc' ? 'labour free, parts charged' : 'labour + parts free'})</span></p>
            <p className="text-[11px] text-[#5d667a]">{o.durationMonths} months · {o.pmVisits} PM visits · breakdown cover after {o.waitingDays} days{o.seller === 'oem' ? ' · sold by the brand' : ''}</p>
            {o.inspectionRequired && <p className="text-[11px] text-amber-800">{o.inspectionReason}. Book an Inspection first; its fee is adjusted in the plan price.</p>}
            {o.renewsUntil && <p className="text-[11px] text-sky-700">Renews after your current plan ends ({fmtDate(o.renewsUntil)})</p>}
          </div>
          <Button size="sm" disabled={o.inspectionRequired || !!busy} onClick={() => buy(o)} className="shrink-0">
            {busy === o._id ? '...' : <>{o.inspectionCredit > 0 && <span className="mr-1 text-[10px] line-through opacity-70">{inr(o.price)}</span>}{inr(o.payable)}</>}
          </Button>
        </div>
      ))}
    </div>
  );
}

/** Lets the customer set the product type on an unverified product (needed to price a service). */
function SubtypePicker({ p, onSaved }) {
  const toast = useToast();
  const { data } = useApi('/catalog/subtypes?limit=200');
  const save = async (subtypeId) => {
    try { await api(`/products/passports/${p._id}`, { method: 'PATCH', body: { subtypeId } }); toast.success('Product type saved'); onSaved(); } catch (e) { toast.error(e.message); }
  };
  return (
    <NativeSelect value={p.subtypeId || ''} onChange={(e) => save(e.target.value)} className="h-8 text-[12px]">
      <option value="" disabled>Choose product type…</option>
      {(data?.items || []).map((s) => <option key={s._id} value={s._id}>{s.category} · {s.name}</option>)}
    </NativeSelect>
  );
}

/** Ownership transfers: approve/reject as the current owner, or upload proof as the new owner. */
function Transfers() {
  const toast = useToast();
  const { data, reload } = useApi('/products/transfers');
  const fileRef = useRef(null);
  const [proofFor, setProofFor] = useState('');
  const items = (data?.items || []).filter((t) => t.transfer?.status === 'pending');
  if (!items.length) return null;
  const decide = async (t, decision) => {
    try { await api(`/products/passports/${t._id}/transfer`, { method: 'PATCH', body: { decision } }); toast.success(decision === 'approve' ? 'Product transferred' : 'Transfer rejected'); reload(); } catch (e) { toast.error(e.message); }
  };
  const uploadProof = async (e) => {
    try {
      const [proofUrl] = await uploadFiles(e.target.files);
      await api(`/products/passports/${proofFor}/transfer-proof`, { method: 'PATCH', body: { proofUrl } });
      toast.success('Proof uploaded. Our team will review it.');
      reload();
    } catch (err) { toast.error(err.message); } finally { e.target.value = ''; }
  };
  return (
    <div className="space-y-2">
      <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={uploadProof} />
      {items.map((t) => (
        <div key={t._id} className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[12.5px]">
          {t.role === 'owner' ? (
            <>
              <p className="font-bold text-[#0b1324]">{t.transfer.requestedName} wants to take over {t.brand} {t.model} ({t.serialNumber})</p>
              <p className="text-[#5d667a]">Approve if you sold or gave this product to them.</p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => decide(t, 'reject')}>Reject</Button>
                <Button size="sm" onClick={() => decide(t, 'approve')}>Approve transfer</Button>
              </div>
            </>
          ) : (
            <>
              <p className="font-bold text-[#0b1324]">Transfer requested: {t.brand} {t.model} ({t.serialNumber})</p>
              <p className="text-[#5d667a]">Waiting for the current owner. {t.transfer.proofUrl ? 'Your proof is with our team for review.' : 'No reply in 72 hours? Upload the invoice or sale note.'}</p>
              {!t.transfer.proofUrl && <Button size="sm" variant="outline" className="mt-2" onClick={() => { setProofFor(t._id); fileRef.current?.click(); }}><Upload className="h-3.5 w-3.5" /> Upload proof</Button>}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/** Single clean, compact product card matching the modern UI reference. */
function ProductItemCard({ p, onChange }) {
  const [expanded, setExpanded] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);
  const note = WARRANTY_NOTE[p.warrantyVerification];
  const cfg = WARRANTY_CONFIG[p.warrantyStatus] || WARRANTY_CONFIG.Unknown;
  const isExpired = p.warrantyDaysLeft != null && p.warrantyDaysLeft < 0;
  const daysText = daysLeftText(p.warrantyDaysLeft);

  const imgSrc = resolveProductImage(p);

  return (
    <div className="w-full max-w-full overflow-hidden rounded-2xl border border-[#e5ebf5] bg-white shadow-[0_2px_8px_rgba(15,35,80,0.04)] transition hover:border-[#ccd7ea]">
      {/* Main card row */}
      <div className="flex items-center gap-3 p-3 sm:p-3.5">
        {/* Product image container */}
        <div className="relative flex h-[70px] w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#edf2f9] bg-[#f8fafc] p-1 sm:h-[78px] sm:w-[86px]">
          {imgSrc ? (
            <img
              src={imgSrc}
              alt={p.model || p.brand}
              className="h-full w-full object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <Package className="h-7 w-7 text-[#9aa5b8]" strokeWidth={1.6} />
          )}
        </div>

        {/* Content details */}
        <div className="min-w-0 flex-1">
          {/* Title */}
          <h3 className="truncate text-[14.5px] font-bold leading-tight text-[#0b1324] sm:text-[15.5px]">
            {p.model || p.brand}
          </h3>

          {/* Subtitle: Model | Serial */}
          <p className="mt-0.5 truncate text-[11.5px] font-medium text-[#5d667a] sm:text-[12px]">
            {p.brand && <span>{p.brand}</span>}
            {p.brand && p.serialNumber && <span className="mx-1 text-[#cfd6e2]">|</span>}
            <span>Serial: {p.serialNumber}</span>
          </p>

          {/* Warranty Pill & Days */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold leading-none', cfg.pill)}>
              <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
              {cfg.label}
            </span>

            {p.warrantyEnd && (
              <span className={cn('truncate text-[11px] font-medium', isExpired ? 'text-red-600' : p.warrantyStatus === 'Expiring Soon' ? 'text-amber-700' : 'text-[#5d667a]')}>
                {daysText}
              </span>
            )}
            {p.subtypeName && <span className="rounded-full bg-[#eef4ff] px-2 py-0.5 text-[10.5px] font-semibold text-[#1456d8]">{p.subtypeName}{p.verified ? ' ✓' : ''}</span>}
          </div>
        </div>

        {/* Expand toggle chevron */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#64748b] hover:bg-[#f1f5f9] transition"
          aria-label={expanded ? 'Collapse details' : 'Expand details'}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {note && <p className={cn('mx-3 mb-2 rounded-lg px-2.5 py-1.5 text-[11px] font-medium', note[1])}>{note[0]}</p>}
      {!p.verified && (
        <div className="mx-3 mb-2 flex items-center gap-2">
          <span className="shrink-0 text-[11px] text-[#5d667a]">Product type</span>
          <SubtypePicker p={p} onSaved={onChange} />
        </div>
      )}

      {/* Expanded metadata drawer */}
      {expanded && (
        <div className="border-t border-[#f0f4fa] bg-[#fafbfd] px-3.5 py-2.5 text-[11.5px] text-[#4a5568]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {p.oemName && (
              <div className="min-w-0">
                <span className="text-[10.5px] font-medium text-[#8c9ba5] block">Manufacturer</span>
                <p className="font-semibold text-[#0b1324] truncate">{p.oemName}</p>
              </div>
            )}
            {p.warrantyNo && (
              <div className="min-w-0">
                <span className="text-[10.5px] font-medium text-[#8c9ba5] block">Warranty No.</span>
                <p className="font-semibold text-[#0b1324] truncate">{p.warrantyNo}</p>
              </div>
            )}
            <div className="min-w-0">
              <span className="text-[10.5px] font-medium text-[#8c9ba5] block">Purchase Date</span>
              <p className="font-semibold text-[#0b1324] truncate">{fmtDate(p.purchaseDate) || '—'}</p>
            </div>
            <div className="min-w-0">
              <span className="text-[10.5px] font-medium text-[#8c9ba5] block">Warranty Expires</span>
              <p className="font-semibold text-[#0b1324] truncate">{fmtDate(p.warrantyEnd) || '—'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Card Action Footer */}
      <div className="flex items-center justify-between border-t border-[#f0f4fa] bg-[#ffffff] px-3 py-2 sm:px-3.5">
        <div className="min-w-0 flex-1 pr-2">
          {p.invoiceUrl ? (
            <a
              href={p.invoiceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-[#e2e8f0] px-2 py-1 text-[11px] font-semibold text-[#475467] hover:bg-[#f8fafc] truncate"
            >
              <FileText className="h-3 w-3 text-[#1456d8] shrink-0" /> Invoice
            </a>
          ) : (
            <span className="text-[10.5px] text-[#94a3b8] italic truncate block">No invoice</span>
          )}
        </div>

        {p.subtypeId && (
          <button type="button" onClick={() => setPlansOpen(!plansOpen)} className="mr-2 shrink-0 inline-flex items-center gap-1 rounded-lg border border-[#c7d9fc] px-2.5 py-1.5 text-[11.5px] font-semibold text-[#1456d8]">
            <Shield className="h-3.5 w-3.5" /> AMC / CMC
          </button>
        )}
        <Link
          to={`/customer/service-requests?new=true&passportId=${p._id}`}
          className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-[#1456d8] px-2.5 py-1.5 text-[11.5px] font-semibold text-white shadow-sm transition hover:bg-[#1149b8] active:scale-95"
        >
          <Wrench className="h-3.5 w-3.5" /> Book Service
        </Link>
      </div>
      {plansOpen && <div className="border-t border-[#f0f4fa] bg-[#fafbfd] px-3 pb-3"><PlansPanel p={p} /></div>}
    </div>
  );
}

export default function ProductPassport() {
  const toast = useToast();
  const { data, reload, loading } = useApi('/products/passports?limit=100');
  const { data: catalog } = useApi('/products?limit=200');
  const { data: subtypes } = useApi('/catalog/subtypes?limit=200');
  const [notice, setNotice] = useState('');
  const [mode, setMode] = useState('list'); // list | form | review
  const [statusFilter, setStatusFilter] = useState('all'); // all | In Warranty | Expiring Soon | Expired
  const [search, setSearch] = useState('');
  const [f, setF] = useState(EMPTY);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const pick = (id) => {
    const p = catalog?.items?.find((x) => x._id === id);
    setF((s) => ({ ...s, productId: id, brand: p?.brand || s.brand, model: p?.model || s.model, subtypeId: p?.subtypeId || s.subtypeId }));
  };

  const review = (e) => {
    e.preventDefault();
    if (!f.brand || !f.serialNumber || !(f.model || f.subtypeId)) {
      return setError('Brand, serial number and the model or product type are required');
    }
    setError('');
    setMode('review');
  };

  const upload = async (e) => {
    try {
      const [url] = await uploadFiles(e.target.files);
      setF((s) => ({ ...s, invoiceUrl: url }));
      toast.success('Invoice attached');
    } catch (err) {
      toast.error(err.message);
    } finally {
      e.target.value = '';
    }
  };

  const save = async () => {
    try {
      const body = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== ''));
      const r = await api('/products/passports', { method: 'POST', body });
      if (r.transferRequested) setNotice(r.message);
      else toast.success('Product passport created');
      setF(EMPTY);
      setMode('list');
      reload();
    } catch (err) {
      setError(err.message);
      setMode('form');
    }
  };

  const allItems = data?.items || [];
  const filtered = allItems.filter((p) => {
    if (statusFilter !== 'all' && p.warrantyStatus !== statusFilter) return false;
    return matches(search.toLowerCase(), p.brand, p.model, p.serialNumber, p.warrantyNo, p.oemName);
  });

  const inWarrantyCount = allItems.filter((p) => p.warrantyStatus === 'In Warranty').length;
  const expiringCount = allItems.filter((p) => p.warrantyStatus === 'Expiring Soon').length;
  const expiredCount = allItems.filter((p) => p.warrantyStatus === 'Expired').length;

  if (mode === 'review') {
    return (
      <Screen back={() => setMode('form')} title="Review Product Passport" subtitle="Confirm your equipment details before saving">
        <div className="rounded-2xl border border-[#e5ebf5] bg-white p-4 shadow-sm space-y-3">
          <div className="flex justify-between border-b border-neutral-100 py-2 text-sm">
            <span className="text-neutral-500">Brand</span>
            <span className="font-semibold text-[#0b1324]">{f.brand}</span>
          </div>
          <div className="flex justify-between border-b border-neutral-100 py-2 text-sm">
            <span className="text-neutral-500">Model</span>
            <span className="font-semibold text-[#0b1324]">{f.model || '—'}</span>
          </div>
          <div className="flex justify-between border-b border-neutral-100 py-2 text-sm">
            <span className="text-neutral-500">Product type</span>
            <span className="font-semibold text-[#0b1324]">{subtypes?.items?.find((s) => s._id === f.subtypeId)?.name || '—'}</span>
          </div>
          <div className="flex justify-between border-b border-neutral-100 py-2 text-sm">
            <span className="text-neutral-500">Serial Number</span>
            <span className="font-semibold text-[#0b1324]">{f.serialNumber}</span>
          </div>
          <div className="flex justify-between border-b border-neutral-100 py-2 text-sm">
            <span className="text-neutral-500">Purchase Date</span>
            <span className="font-semibold text-[#0b1324]">{fmtDate(f.purchaseDate)}</span>
          </div>
          <div className="flex justify-between border-b border-neutral-100 py-2 text-sm">
            <span className="text-neutral-500">Warranty Ends</span>
            <span className="font-semibold text-[#0b1324]">
              {f.warrantyEnd ? fmtDate(f.warrantyEnd) : 'Calculated automatically'}
            </span>
          </div>
          <div className="flex justify-between py-2 text-sm">
            <span className="text-neutral-500">Invoice</span>
            <span className="font-semibold text-[#0b1324]">{f.invoiceUrl ? 'Attached' : 'Not attached'}</span>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={() => setMode('form')}>
            Edit
          </Button>
          <Button className="flex-1 bg-[#1456d8] hover:bg-[#1149b8]" onClick={save}>
            Save Passport
          </Button>
        </div>
      </Screen>
    );
  }

  if (mode === 'form') {
    return (
      <Screen back={() => setMode('list')} title="Add Equipment" subtitle="Register product passport for warranty and service">
        <form onSubmit={review} className="space-y-4">
          <div className="rounded-2xl border border-[#e5ebf5] bg-white p-4 shadow-sm space-y-3.5">
            <Field label="Pick from catalog (optional)">
              <NativeSelect value={f.productId} onChange={(e) => pick(e.target.value)}>
                <option value="">Not listed — enter manually</option>
                {catalog?.items?.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.brand} · {p.model}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Brand">
              <Input placeholder="e.g. Aftenza, Voltas" value={f.brand} onChange={set('brand')} required />
            </Field>
            <Field label="Model (if you know it)">
              <Input placeholder="e.g. KS-Q18" value={f.model} onChange={set('model')} />
            </Field>
            <Field label="Product type">
              <NativeSelect value={f.subtypeId} onChange={set('subtypeId')} disabled={!!catalog?.items?.find((x) => x._id === f.productId)?.subtypeId}>
                <option value="">Choose (for example Split AC 1.5 Ton)</option>
                {subtypes?.items?.map((s) => <option key={s._id} value={s._id}>{s.category} · {s.name}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Serial number">
              <Input placeholder="Scan or type the serial on the sticker" value={f.serialNumber} onChange={set('serialNumber')} required />
            </Field>
            <Field label="Purchase date (needed for warranty)">
              <Input type="date" value={f.purchaseDate} onChange={set('purchaseDate')} />
            </Field>
            <Field label="Warranty end date (optional)">
              <Input type="date" value={f.warrantyEnd} onChange={set('warrantyEnd')} />
            </Field>
            <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={upload} />
            <Button
              type="button"
              variant="outline"
              className="w-full flex items-center justify-center gap-2"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-4 w-4" /> {f.invoiceUrl ? 'Invoice attached — Click to replace' : 'Upload Purchase Invoice'}
            </Button>
          </div>
          <ErrorNote>{error}</ErrorNote>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setMode('list')}>
              Cancel
            </Button>
            <Button className="flex-1 bg-[#1456d8] hover:bg-[#1149b8]">Continue to Review</Button>
          </div>
        </form>
      </Screen>
    );
  }

  return (
    <div className="w-full max-w-full overflow-hidden space-y-3.5">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] sm:text-[22px] font-bold tracking-tight text-[#0b1324]">My Products</h1>
          <p className="text-[12px] sm:text-[13px] text-[#5d667a]">
            {allItems.length} registered {allItems.length === 1 ? 'equipment' : 'equipments'}
          </p>
        </div>
        <Button
          size="sm"
          className="gap-1.5 rounded-xl bg-[#1456d8] font-semibold text-white shadow-sm hover:bg-[#1149b8]"
          onClick={() => setMode('form')}
        >
          <Plus className="h-4 w-4" /> Add Product
        </Button>
      </div>

      {notice && <p className="rounded-2xl border border-sky-200 bg-sky-50 p-3 text-[12.5px] text-sky-900">{notice}</p>}
      <Transfers />

      {/* Search Input Bar */}
      <div className="relative w-full">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a94a6]" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search product, model, or serial no..."
          className="h-10 w-full rounded-xl border-[#e2e8f0] bg-white pl-9 pr-3 text-[13px] placeholder:text-[#8a94a6]"
        />
      </div>

      {/* Filter Tabs: 4-column responsive grid with ZERO horizontal scroll */}
      <div className="grid w-full grid-cols-4 gap-1 rounded-xl bg-[#edf2fa] p-1">
        {[
          { key: 'all', label: 'All', count: allItems.length },
          { key: 'In Warranty', label: 'Warranty', count: inWarrantyCount },
          { key: 'Expiring Soon', label: 'Expiring', count: expiringCount },
          { key: 'Expired', label: 'Expired', count: expiredCount },
        ].map((tab) => {
          const active = statusFilter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusFilter(tab.key)}
              className={cn(
                'flex items-center justify-center gap-1 rounded-lg py-2 px-1 text-center transition-all min-w-0',
                active
                  ? 'bg-white text-[#1456d8] shadow-[0_2px_6px_rgba(20,86,216,0.12)] font-bold'
                  : 'text-[#5d667a] hover:text-[#0b1324] font-medium'
              )}
            >
              <span className="truncate text-[11.5px] leading-none sm:text-[12px]">{tab.label}</span>
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[9.5px] sm:text-[10px] font-bold leading-none shrink-0',
                  active ? 'bg-[#1456d8]/10 text-[#1456d8]' : 'bg-[#dce4f0] text-[#5d667a]'
                )}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Product List */}
      <div className="space-y-3">
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-28 animate-pulse rounded-2xl bg-[#e8eef8]" />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[#d3dcee] bg-white p-8 text-center">
            <Package className="mx-auto h-10 w-10 text-[#9aa5b8]" strokeWidth={1.5} />
            <h4 className="mt-2 text-[15px] font-semibold text-[#0b1324]">
              {search ? 'No products match your search' : 'No products found'}
            </h4>
            <p className="mt-1 text-[12.5px] text-[#5d667a]">
              {search
                ? 'Try a different search keyword or clear the filter.'
                : 'Register your products to track warranty coverage and book hassle-free service.'}
            </p>
            {!search && (
              <Button
                size="sm"
                className="mt-3.5 rounded-xl bg-[#1456d8] font-semibold text-white hover:bg-[#1149b8]"
                onClick={() => setMode('form')}
              >
                <Plus className="h-4 w-4" /> Add Product Now
              </Button>
            )}
          </div>
        )}

        {!loading && filtered.map((p) => <ProductItemCard key={p._id} p={p} onChange={reload} />)}
      </div>
    </div>
  );
}
