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
            </CardContent>
          </Card>
        </div>
      )}
    </PageShell>
  );
}
