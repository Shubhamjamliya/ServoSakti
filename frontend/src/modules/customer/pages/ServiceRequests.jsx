import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Building2, Check, CheckCircle2, Factory, Home as HomeIcon, LocateFixed, MapPin, Package, Plus, Sparkles } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input, NativeSelect, Textarea } from '@/shared/components/ui/input';
import { Empty, ErrorNote, Field, Panel, RowLink, Screen, StatusPill } from '@/shared/components/Mobile';
import { api } from '@/shared/lib/api';
import { useApi } from '@/shared/lib/useApi';
import { useToast } from '@/shared/context/ToastContext';
import { JOB_TYPES, SLOTS, fmtDate } from '@/shared/lib/format';
import { resolveProductImage, WARRANTY_CONFIG } from '@/shared/lib/productImages';
import { loadGoogleMaps, parsePlace } from '@/shared/lib/googleMaps';
import { payWith } from '@/shared/lib/razorpay';
import BillView, { CoverageBadge } from '@/shared/components/BillView';
import { cn, inr } from '@/shared/lib/utils';

/** 'YYYY-MM-DDT10:00' for tomorrow in the browser's time zone (datetime-local value). */
const tomorrowAt10 = () => {
  const d = new Date(Date.now() + 86400000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:00`;
};

export default function ServiceRequests() {
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  // opened straight into the form from another page (Book Service on a product): back returns there
  const closeForm = () => (searchParams.get('new') && window.history.state?.idx > 0 ? navigate(-1) : setOpen(false));
  const { data, reload } = useApi('/service-requests?limit=100');
  const { data: passports } = useApi('/products/passports?limit=100');
  const { data: me } = useApi('/customers/me');
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ passportId: '', addressId: '', jobType: 'breakdown', slot: 'scheduled', scheduledAt: tomorrowAt10(), addOnIds: [], paymentMode: 'postpaid', city: '', address: '', issue: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [estimate, setEstimate] = useState(null);
  const [estimateError, setEstimateError] = useState('');

  // Current location mode
  const [useCurrentLoc, setUseCurrentLoc] = useState(false);
  const [locating, setLocating] = useState(false);
  const [currentLocData, setCurrentLocData] = useState(null);

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const addresses = me?.addresses || [];
  const saved = addresses.find((x) => x._id === f.addressId) || addresses.find((x) => x.isDefault) || addresses[0];

  useEffect(() => {
    const isNew = searchParams.get('new');
    const pid = searchParams.get('passportId');
    if (isNew || pid) {
      setOpen(true);
      if (pid) setF((s) => ({ ...s, passportId: pid }));
    }
  }, [searchParams]);

  useEffect(() => {
    if (saved?._id && !f.addressId && !useCurrentLoc) {
      setF((s) => ({ ...s, addressId: saved._id }));
    }
  }, [saved, f.addressId, useCurrentLoc]);

  const selectedProduct = passports?.items?.find((p) => p._id === f.passportId);
  const { data: addOnData } = useApi(selectedProduct?.subtypeId ? `/catalog/add-ons?limit=100&subtype=${selectedProduct.subtypeId}` : null);

  const handleLocateCurrent = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }
    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        try {
          let line = `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;
          let city = 'Indore';
          let state = '';
          let pincode = '';

          try {
            const maps = await loadGoogleMaps();
            const geocoder = new maps.Geocoder();
            const res = await new Promise((resolve, reject) => {
              geocoder.geocode({ location: { lat, lng } }, (results, status) => {
                if (status === 'OK' && results && results[0]) resolve(results[0]);
                else reject(new Error('Reverse geocode failed'));
              });
            });
            const p = parsePlace(res, lat, lng);
            line = p.line || line;
            city = p.city || city;
            state = p.state || state;
            pincode = p.pincode || pincode;
          } catch {}

          let zoneName = '';
          try {
            const z = await api(`/zones/detect?lat=${lat}&lng=${lng}`);
            if (z?.zone?.name) zoneName = z.zone.name;
          } catch {}

          setCurrentLocData({ lat, lng, line, city, state, pincode, zoneName });
          setUseCurrentLoc(true);
          toast.success('Current location detected');
        } catch (err) {
          setError(err.message || 'Failed to determine location details');
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        setLocating(false);
        setError('Could not access current location. Please allow location permissions or select a saved address.');
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const buildBody = () => {
    const body = { ...f, scheduledAt: f.slot === 'scheduled' && f.scheduledAt ? new Date(f.scheduledAt).toISOString() : undefined };
    if (useCurrentLoc && currentLocData) {
      body.addressId = undefined;
      body.address = currentLocData.line;
      body.city = currentLocData.city;
      body.location = { lat: currentLocData.lat, lng: currentLocData.lng };
    } else {
      body.addressId = saved?._id;
      body.city = saved ? undefined : f.city;
      body.address = saved ? undefined : f.address;
    }
    return body;
  };

  // Live price from the server whenever anything that changes it changes. Nothing is calculated in the app.
  const estimateKey = JSON.stringify([f.passportId, f.jobType, f.slot, f.scheduledAt, f.addOnIds, f.paymentMode, f.addressId, useCurrentLoc && currentLocData?.lat]);
  useEffect(() => {
    if (!open || !f.passportId) { setEstimate(null); return undefined; }
    let live = true;
    const t = setTimeout(() => {
      api('/service-requests/estimate', { method: 'POST', body: buildBody() })
        .then((r) => live && (setEstimate(r), setEstimateError('')))
        .catch((err) => live && (setEstimate(null), setEstimateError(err.message)));
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [open, estimateKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const created = await api('/service-requests', { method: 'POST', body: buildBody() });
      if (created.payment) {
        try {
          await payWith(created.payment);
          toast.success('Payment received. Booking confirmed.');
        } catch (payErr) {
          toast.error(`${payErr.message}. You can pay from Track Service within 15 minutes to keep the booking.`);
        }
      } else toast.success('Service request raised successfully');
      setOpen(false);
      setF((s) => ({ ...s, issue: '', addOnIds: [] }));
      setUseCurrentLoc(false);
      setCurrentLocData(null);
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleAddOn = (id) => setF((s) => ({ ...s, addOnIds: s.addOnIds.includes(id) ? s.addOnIds.filter((x) => x !== id) : [...s.addOnIds, id] }));
  const addOns = (addOnData?.items || []).filter((a) => !a.jobTypes?.length || a.jobTypes.includes(f.jobType));

  if (open) {
    return (
      <Screen back={closeForm} title="New service request" subtitle="Pick the product that needs service">
        <form onSubmit={submit} className="space-y-3">
          <Panel className="space-y-3">
            <Field label="Product">
              <NativeSelect required value={f.passportId} onChange={set('passportId')}>
                <option value="" disabled>{passports?.items?.length ? 'Select product...' : 'Add a product first'}</option>
                {passports?.items?.map((p) => <option key={p._id} value={p._id}>{p.brand} {p.model} · {p.serialNumber} ({p.warrantyStatus})</option>)}
              </NativeSelect>
            </Field>

            {selectedProduct && (
              <div className="flex items-center gap-3 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-2.5">
                <div className="flex h-12 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#e2e8f0] bg-white p-1">
                  <img
                    src={resolveProductImage(selectedProduct)}
                    alt=""
                    className="h-full w-full object-contain"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-bold text-[#0b1324]">{selectedProduct.brand} {selectedProduct.model}</p>
                  <p className="truncate text-[11.5px] text-[#5d667a]">Model: {selectedProduct.model} | Serial: {selectedProduct.serialNumber}</p>
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#e8f7ee] px-2 py-0.5 text-[10.5px] font-semibold text-[#137a43]">
                    <CheckCircle2 className="h-3 w-3" /> {selectedProduct.warrantyStatus || 'Under Warranty'}
                  </span>
                </div>
              </div>
            )}
            <Field label="Service type"><NativeSelect value={f.jobType} onChange={(e) => setF((s) => ({ ...s, jobType: e.target.value, addOnIds: [] }))}>{JOB_TYPES.map((j) => <option key={j.value} value={j.value}>{j.label}</option>)}</NativeSelect></Field>

            <Field label="When do you need it?">
              <div className="grid grid-cols-3 gap-1.5">
                {SLOTS.map((s) => (
                  <button key={s.value} type="button" onClick={() => setF((x) => ({ ...x, slot: s.value }))}
                    className={cn('rounded-xl border px-2 py-2 text-left', f.slot === s.value ? 'border-[#1456d8] bg-[#eef4ff]' : 'border-[#e2e8f0] bg-white')}>
                    <p className="text-[13px] font-bold text-[#0b1324]">{s.label}</p>
                    <p className="text-[10.5px] text-[#5d667a]">{s.hint}</p>
                  </button>
                ))}
              </div>
            </Field>
            {f.slot === 'scheduled' && (
              <Field label="Preferred date and time"><Input type="datetime-local" required value={f.scheduledAt} min={tomorrowAt10().slice(0, 10) + 'T00:00'} onChange={set('scheduledAt')} /></Field>
            )}

            {addOns.length > 0 && (
              <Field label="Add-ons (optional)">
                <div className="space-y-1.5">
                  {addOns.map((a) => (
                    <label key={a._id} className="flex items-center justify-between gap-2 rounded-xl border border-[#e2e8f0] bg-white px-3 py-2 text-[13px]">
                      <span className="flex items-center gap-2"><input type="checkbox" checked={f.addOnIds.includes(a._id)} onChange={() => toggleAddOn(a._id)} />{a.name}</span>
                      <span className="font-semibold">{inr(a.price)}</span>
                    </label>
                  ))}
                </div>
              </Field>
            )}

            <Field label="Payment">
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-[#edf2fa] p-1 text-[12px] font-semibold">
                {[['prepaid', 'Pay now (online)'], ['postpaid', 'Pay after service']].map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setF((s) => ({ ...s, paymentMode: v }))}
                    className={cn('rounded-lg py-1.5', f.paymentMode === v ? 'bg-white font-bold text-[#1456d8] shadow-sm' : 'text-[#5d667a]')}>{l}</button>
                ))}
              </div>
            </Field>
            {/* Service Location Section */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
                  Service Location *
                </span>
                <Link to="/customer/addresses" className="text-[11.5px] font-semibold text-[#1456d8] hover:underline">
                  Manage Addresses
                </Link>
              </div>

              {/* Mode Selector */}
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-[#edf2fa] p-1 text-[12px] font-semibold">
                <button
                  type="button"
                  onClick={() => setUseCurrentLoc(false)}
                  className={cn(
                    'py-1.5 rounded-lg transition-all',
                    !useCurrentLoc ? 'bg-white text-[#1456d8] shadow-sm font-bold' : 'text-[#5d667a]'
                  )}
                >
                  Saved Addresses ({addresses.length})
                </button>
                <button
                  type="button"
                  onClick={handleLocateCurrent}
                  className={cn(
                    'py-1.5 rounded-lg flex items-center justify-center gap-1 transition-all',
                    useCurrentLoc ? 'bg-white text-[#1456d8] shadow-sm font-bold' : 'text-[#5d667a]'
                  )}
                >
                  <LocateFixed className="h-3.5 w-3.5" />
                  <span>Use Current GPS</span>
                </button>
              </div>

              {/* Case 1: Using Current GPS Location */}
              {useCurrentLoc ? (
                <div className="rounded-xl border border-[#c7d9fc] bg-[#f0f6ff] p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <LocateFixed className="h-4 w-4 text-[#1456d8] shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[12.5px] font-bold text-[#0b1324]">Using Current Device Location</p>
                        {currentLocData ? (
                          <>
                            <p className="text-[12px] text-[#475467] mt-0.5">{currentLocData.line}</p>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.2 text-[10.5px] font-semibold">
                                <CheckCircle2 className="h-3 w-3" /> GPS Pin Verified
                              </span>
                              {currentLocData.zoneName && (
                                <span className="rounded-full bg-blue-100 text-blue-800 px-2 py-0.2 text-[10.5px] font-semibold">
                                  Zone: {currentLocData.zoneName}
                                </span>
                              )}
                            </div>
                          </>
                        ) : (
                          <p className="text-[11.5px] text-[#5d667a] mt-0.5">Fetching coordinates...</p>
                        )}
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={locating}
                      onClick={handleLocateCurrent}
                      className="h-7 text-[11px] shrink-0 rounded-lg border-[#b7cefb] bg-white"
                    >
                      {locating ? 'Locating...' : 'Refresh GPS'}
                    </Button>
                  </div>
                </div>
              ) : (
                /* Case 2: Using Saved Addresses */
                <div>
                  {addresses.length ? (
                    <div className="space-y-1.5">
                      <NativeSelect
                        value={saved?._id || ''}
                        onChange={(e) => {
                          setUseCurrentLoc(false);
                          set('addressId')(e);
                        }}
                      >
                        {addresses.map((x) => (
                          <option key={x._id} value={x._id}>
                            {x.label || 'Address'} — {x.line} {x.zoneName ? `(${x.zoneName})` : ''}
                          </option>
                        ))}
                      </NativeSelect>
                      {saved && (
                        <div className="rounded-xl border border-[#e2e8f0] bg-[#fafbfd] p-2.5 text-[11.5px] text-[#475467]">
                          <p className="font-semibold text-[#0b1324] flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5 text-[#1456d8]" />
                            {saved.label || 'Address'} {saved.isDefault && '• (Default)'}
                          </p>
                          <p className="mt-0.5 truncate">{saved.line}, {saved.city} {saved.pincode}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 space-y-2">
                      <p className="text-xs text-amber-900 leading-snug">
                        No saved address found. You can use your current location or save a permanent address.
                      </p>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleLocateCurrent}
                          className="h-8 text-xs bg-[#1456d8] hover:bg-[#1149b8] text-white rounded-lg"
                        >
                          <LocateFixed className="h-3.5 w-3.5" /> Use Current GPS
                        </Button>
                        <Link to="/customer/addresses?action=add-address">
                          <Button type="button" size="sm" variant="outline" className="h-8 text-xs rounded-lg">
                            + Add to Saved
                          </Button>
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <Field label="What is the problem?"><Textarea value={f.issue} onChange={set('issue')} required /></Field>
          </Panel>

          {f.passportId && (
            <Panel className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[14px] font-bold text-[#0b1324]">Price estimate</p>
                {estimate && <CoverageBadge coverage={estimate.coverage} />}
              </div>
              {estimateError && <p className="text-[12.5px] text-amber-800">{estimateError}{/product type/i.test(estimateError) && <> <Link className="font-semibold underline" to="/customer/product-passport">Set it in My Products</Link></>}</p>}
              {estimate && (
                <>
                  <BillView bill={estimate.bill} showPayments={false} />
                  {estimate.subscription && <p className="text-[11.5px] text-[#5d667a]">{estimate.subscription.type.toUpperCase()} · PM visits used {estimate.subscription.pmVisitsUsed} of {estimate.subscription.pmVisitsTotal}</p>}
                  {estimate.jobType === 'breakdown' && <p className="text-[11.5px] text-[#5d667a]">The visit charge covers diagnosis. Repair labour and parts are added after the engineer checks, only with your approval. The visit charge is adjusted in the repair price.</p>}
                  <p className="rounded-lg bg-[#f4f7fc] px-2.5 py-1.5 text-[11.5px] text-[#475467]">Final price is confirmed after the engineer checks your product. Any increase needs your approval in the app.</p>
                  {estimate.bill.upfront > 0 && <p className="text-[12.5px] font-semibold text-[#0b1324]">To pay now: {inr(estimate.bill.upfront)}{f.paymentMode === 'postpaid' && <span className="font-normal text-[#5d667a]"> (visit charge / slot surcharge, the rest after service)</span>}</p>}
                </>
              )}
            </Panel>
          )}

          <ErrorNote>{error}</ErrorNote>
          <div className="flex gap-2"><Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button><Button className="flex-1" disabled={busy || (!!f.passportId && !estimate)}>{busy ? 'Submitting...' : estimate?.bill.upfront > 0 ? `Pay ${inr(estimate.bill.upfront)} & book` : 'Book service'}</Button></div>
        </form>
      </Screen>
    );
  }

  return (
    <Screen back="/customer/home" title="Service requests" action={<Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New</Button>}>
      <p className="text-sm text-neutral-500">Prefer to describe it in your own words? <Link className="text-primary underline" to="/customer/complaints">Use the AI complaint assistant</Link>.</p>
      {!data?.items?.length && <Empty>No service requests yet.</Empty>}
      <div className="space-y-2">
        {(data?.items || []).map((r) => (
          <RowLink key={r._id} to="/customer/tracking" title={`${r.srNumber} · ${[r.brand, r.model].filter(Boolean).join(' ')}`} meta={`${fmtDate(r.createdAt)} · ${r.city || ''}`} right={<StatusPill status={r.status} />} />
        ))}
      </div>
    </Screen>
  );
}
