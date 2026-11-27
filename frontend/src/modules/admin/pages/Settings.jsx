import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Input, NativeSelect } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { PageShell } from '@/shared/components/PageShell';
import { api } from '@/shared/lib/api';
import { useApi } from '@/shared/lib/useApi';
import { useToast } from '@/shared/context/ToastContext';
import { PRIORITIES } from '@/shared/lib/format';

const Confirm = () => (
  <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-amber-700 ring-1 ring-inset ring-amber-600/20">
    <AlertTriangle className="h-3 w-3" /> Needs client confirmation
  </span>
);

function Num({ label, value, onChange, hint, confirm }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}{confirm && <Confirm />}</Label>
      <Input type="number" min="0" value={value ?? ''} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <p className="text-xs text-neutral-500">{hint}</p>}
    </div>
  );
}

const YesNo = ({ label, value, onChange, yes, no, hint }) => (
  <div className="space-y-1.5">
    <Label>{label}</Label>
    <NativeSelect value={String(value !== false)} onChange={(e) => onChange(e.target.value === 'true')}>
      <option value="true">{yes}</option>
      <option value="false">{no}</option>
    </NativeSelect>
    {hint && <p className="text-xs text-neutral-500">{hint}</p>}
  </div>
);

const slabsText = (slabs = []) => slabs.map((x) => `${x.fromKm}-${x.toKm}:${x.amount}`).join(', ');
const parseSlabs = (text) => String(text).split(',').map((part) => {
  const m = part.trim().match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  return m && { fromKm: Number(m[1]), toKm: Number(m[2]), amount: Number(m[3]) };
}).filter(Boolean);

/** Customer pricing, payment, cancellation and plan rules (Setting.pricing). */
function PricingSettings({ p, onChange }) {
  const set = (k, v) => onChange({ ...p, [k]: v });
  const [slabs, setSlabs] = useState(slabsText(p.distanceSlabs));
  const sur = p.slotSurcharges || {};
  return (
    <>
      <Card>
        <CardHeader><CardTitle>Customer charges</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Distance slabs (from-to km : ₹)</Label>
            <Input value={slabs} onChange={(e) => setSlabs(e.target.value)} onBlur={() => set('distanceSlabs', parseSlabs(slabs))} placeholder="0-10:0, 10-20:100, 20-40:250" />
            <p className="text-xs text-neutral-500">Measured from the centre of the customer's service zone, so the price is shown before an engineer is assigned.</p>
          </div>
          <Num label="Beyond the last slab (₹ per km, 0 = not serviceable)" value={p.outstationPerKm} onChange={(v) => set('outstationPerKm', v)} />
          <YesNo label="Distance charge under warranty / AMC / CMC" value={p.distanceUnderCoverage} onChange={(v) => set('distanceUnderCoverage', v)} yes="Customer still pays it" no="Free for covered customers" />
          <div className="grid grid-cols-2 gap-4">
            <Num label="Same-day slot (₹)" value={sur.same_day} onChange={(v) => set('slotSurcharges', { ...sur, same_day: v })} />
            <Num label="Urgent slot (₹)" value={sur.urgent} onChange={(v) => set('slotSurcharges', { ...sur, urgent: v })} />
            <Num label="Sunday / holiday (₹)" value={sur.sunday} onChange={(v) => set('slotSurcharges', { ...sur, sunday: v })} />
            <Num label="Night slot (₹)" value={sur.night} onChange={(v) => set('slotSurcharges', { ...sur, night: v })} />
            <Num label="Urgent = within (hours)" value={p.urgentWithinHours} onChange={(v) => set('urgentWithinHours', v)} />
            <Num label="Night starts at (hour, 24h)" value={p.nightFromHour} onChange={(v) => set('nightFromHour', v)} />
          </div>
          <div className="space-y-1.5">
            <Label>Holidays (charged like Sunday)</Label>
            <Input value={(p.holidays || []).join(', ')} onChange={(e) => set('holidays', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} placeholder="2026-12-25, 2027-01-26" />
          </div>
          <Num label="Engineer's share of slot surcharges (%)" value={p.surchargeEngineerShare} onChange={(v) => set('surchargeEngineerShare', v)} />
          <Num label="Prepaid discount (% of service + add-ons)" value={p.prepaidDiscountPercent} onChange={(v) => set('prepaidDiscountPercent', v)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Payments, cancellations & visits</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <Num label="Revised price expires after (min)" value={p.approvalWindowMinutes} onChange={(v) => set('approvalWindowMinutes', v)} />
          <Num label="Unpaid booking released after (min)" value={p.paymentHoldMinutes} onChange={(v) => set('paymentHoldMinutes', v)} />
          <Num label="Free cancellation until (hours before slot)" value={p.cancellationFreeHours} onChange={(v) => set('cancellationFreeHours', v)} />
          <Num label="Late cancellation fee (₹)" value={p.cancellationFee} onChange={(v) => set('cancellationFee', v)} />
          <Num label="Engineer's share of the fee (%)" value={p.cancellationEngineerShare} onChange={(v) => set('cancellationEngineerShare', v)} />
          <Num label="Reschedules allowed" value={p.maxReschedules} onChange={(v) => set('maxReschedules', v)} />
          <Num label="No-show: wait at least (min)" value={p.noShowWaitMinutes} onChange={(v) => set('noShowWaitMinutes', v)} />
          <Num label="Engineer late after (min) → free cancel" value={p.lateArrivalMinutes} onChange={(v) => set('lateArrivalMinutes', v)} />
          <Num label="Cash limit per engineer (₹)" value={p.cashLimit} onChange={(v) => set('cashLimit', v)} />
          <div className="col-span-2">
            <YesNo label="Customers can report a problem after a visit" value={p.disputesEnabled} onChange={(v) => set('disputesEnabled', v)} yes="On — within the window below" no="Off — the button is hidden" />
          </div>
          <div className="col-span-2">
            <YesNo label="Independent engineers (no service company)" value={p.independentEngineers} onChange={(v) => set('independentEngineers', v)} yes="On: they can sign up and get jobs" no="Off: no sign-up, no new jobs (existing ones can still log in to finish jobs and settle their wallet)" />
          </div>
          <Num label="Report-a-problem window (days after the visit)" value={p.disputeWindowDays} onChange={(v) => set('disputeWindowDays', v)} />
          <Num label="Minimum withdrawal (₹, engineers & service companies)" value={p.minWithdrawal} onChange={(v) => set('minWithdrawal', v)} />
          <Num label="Repeat visit free within (days)" value={p.repeatVisitDays} onChange={(v) => set('repeatVisitDays', v)} />
          <Num label="Coverage on booking date honoured for (days)" value={p.coverageGraceDays} onChange={(v) => set('coverageGraceDays', v)} />
          <div className="col-span-2">
            <YesNo label="No-show under warranty / AMC / CMC" value={p.noShowUnderCoverage} onChange={(v) => set('noShowUnderCoverage', v)} yes="Visit charge still applies" no="Free for covered customers" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>AMC / CMC rules</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <Num label="Inspection needed if older than (months)" value={p.planInspectionAgeMonths} onChange={(v) => set('planInspectionAgeMonths', v)} />
          <Num label="Inspection valid for (days)" value={p.inspectionValidDays} onChange={(v) => set('inspectionValidDays', v)} />
          <Num label="Full refund if cancelled within (days)" value={p.planFullRefundDays} onChange={(v) => set('planFullRefundDays', v)} />
          <div className="space-y-1.5">
            <Label>Renewal reminders (days before expiry)</Label>
            <Input value={(p.planRenewalReminderDays || []).join(', ')} onChange={(e) => set('planRenewalReminderDays', e.target.value.split(',').map((x) => Number(x.trim())).filter((n) => n > 0))} placeholder="30, 7" />
          </div>
        </CardContent>
      </Card>
    </>
  );
}

export default function Settings() {
  const toast = useToast();
  const { data, loading, reload } = useApi('/admin/settings');
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (data) setS(data); }, [data]);

  const set = (k, v) => setS((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setSaving(true);
    try {
      await api('/admin/settings', { method: 'PUT', body: s });
      toast.success('Settings saved');
      reload();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <PageShell eyebrow="System" title="Settings" actions={<Button onClick={save} disabled={saving || !s}>{saving ? 'Saving...' : 'Save changes'}</Button>}>
      {loading || !s ? <p className="text-sm text-neutral-500">Loading...</p> : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Dispatch</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Num label="Acceptance window (minutes)" value={s.acceptanceWindowMinutes} onChange={(v) => set('acceptanceWindowMinutes', v)} hint="Default 10 — subject to client approval. Expired offers move to the next candidate automatically." confirm />
              <Num label="Maximum service radius (km)" value={s.maxRadiusKm} onChange={(v) => set('maxRadiusKm', v)} hint="Engineers farther than this from the site are skipped." />
              <Num label="Maximum open calls per engineer" value={s.maxEngineerLoad} onChange={(v) => set('maxEngineerLoad', v)} />
              <div className="space-y-1.5">
                <Label>Automatic dispatch</Label>
                <NativeSelect value={String(s.autoDispatch)} onChange={(e) => set('autoDispatch', e.target.value === 'true')}>
                  <option value="true">On — dispatch as soon as a request is verified</option>
                  <option value="false">Off — admin starts dispatch manually</option>
                </NativeSelect>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>SLA / TAT (hours)</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              {PRIORITIES.map((p) => (
                <Num key={p} label={p} value={s.slaHours?.[p]} onChange={(v) => set('slaHours', { ...s.slaHours, [p]: v })} />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Engineer incentive</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Num label="Approved calls needed per month" value={s.minApprovedCallsForRecharge} onChange={(v) => set('minApprovedCallsForRecharge', v)} />
              <Num label="Recharge validity (days)" value={s.rechargeDays} onChange={(v) => set('rechargeDays', v)} />
              <div className="space-y-1.5">
                <Label>Recharge timing<Confirm /></Label>
                <NativeSelect value={s.rechargeTiming} onChange={(e) => set('rechargeTiming', e.target.value)}>
                  <option value="month_end">Month end</option>
                  <option value="next_month">Next month cycle</option>
                  <option value="after_approval">Right after approval</option>
                </NativeSelect>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Service zones & reminders</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Service-area check</Label>
                <NativeSelect value={String(s.enforceZones)} onChange={(e) => set('enforceZones', e.target.value === 'true')}>
                  <option value="true">On — customers outside every active zone cannot book</option>
                  <option value="false">Off — accept requests from anywhere</option>
                </NativeSelect>
                <p className="text-xs text-neutral-500">Only applies once at least one zone exists (Operations → Service Zones).</p>
              </div>
              <div className="space-y-1.5">
                <Label>Warranty-expiry reminders (days before expiry)</Label>
                <Input value={(s.warrantyReminderDays || []).join(', ')} onChange={(e) => set('warrantyReminderDays', e.target.value.split(',').map((x) => Number(x.trim())).filter((n) => n > 0))} placeholder="30, 7, 1" />
                <p className="text-xs text-neutral-500">Customers get a push + in-app alert at each of these points. Sent daily at 9:00 AM IST.</p>
              </div>
            </CardContent>
          </Card>

          <PricingSettings p={s.pricing || {}} onChange={(pricing) => set('pricing', pricing)} />

          <Card>
            <CardHeader><CardTitle>Billing & payout policy</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Num label="GST rate (%)" value={s.gstPercent} onChange={(v) => set('gstPercent', v)} confirm hint="Final tax configuration needs the client accountant's confirmation." />
              <div className="space-y-1.5">
                <Label>Repeat-call payouts<Confirm /></Label>
                <NativeSelect value={s.repeatCallPayout} onChange={(e) => set('repeatCallPayout', e.target.value)}>
                  <option value="hold">Hold for admin review</option>
                  <option value="pay">Pay normally</option>
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label>Failed-call payouts<Confirm /></Label>
                <NativeSelect value={s.failedCallPayout} onChange={(e) => set('failedCallPayout', e.target.value)}>
                  <option value="hold">Create payout, hold for admin review</option>
                  <option value="pay">Create payout, pay normally</option>
                  <option value="none">No payout</option>
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label>Recharge when engineer was inactive<Confirm /></Label>
                <NativeSelect value={s.inactiveMonthRecharge} onChange={(e) => set('inactiveMonthRecharge', e.target.value)}>
                  <option value="ineligible">Not eligible</option>
                  <option value="eligible">Still eligible</option>
                </NativeSelect>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </PageShell>
  );
}
