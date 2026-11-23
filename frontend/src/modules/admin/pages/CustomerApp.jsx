import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ImagePlus, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { PageShell } from '@/shared/components/PageShell';
import { api } from '@/shared/lib/api';
import { refreshBranding } from '@/shared/lib/useBranding';
import { useApi } from '@/shared/lib/useApi';
import { useToast } from '@/shared/context/ToastContext';
import { DEFAULT_BANNERS, DEFAULT_SUBTITLE, QUICK_ACTIONS } from '@/modules/customer/homeDefaults';

const uploadImage = async (file) => {
  const form = new FormData();
  form.append('files', file);
  return (await api('/uploads', { method: 'POST', body: form })).urls[0];
};

/** Thumbnail + upload / reset buttons. `fallback` is what the app shows when nothing is uploaded. */
function ImageField({ value, fallback, onChange, wide }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const pick = async (file) => {
    if (!file) return;
    setBusy(true);
    try { onChange(await uploadImage(file)); } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="flex items-center gap-3">
      <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-[#e8f1ff] ${wide ? 'h-16 w-24' : 'h-16 w-16'}`}>
        {value || fallback ? <img src={value || fallback} alt="" className="h-full w-full object-contain" /> : <ImagePlus className="h-5 w-5 text-neutral-400" />}
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="cursor-pointer rounded-lg border px-2.5 py-1 text-center text-xs font-semibold hover:bg-neutral-50">
          {busy ? 'Uploading...' : 'Upload image'}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={busy} onChange={(e) => { pick(e.target.files[0]); e.target.value = ''; }} />
        </label>
        {value && <button type="button" onClick={() => onChange('')} className="flex items-center gap-1 text-xs text-neutral-500"><RotateCcw className="h-3 w-3" /> Use default</button>}
      </div>
    </div>
  );
}

export default function CustomerApp() {
  const toast = useToast();
  const { data, loading, reload } = useApi('/admin/customer-home');
  const [f, setF] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    const h = data.customerHome || {};
    setF({
      subtitle: h.subtitle || DEFAULT_SUBTITLE,
      banners: (h.banners?.length ? h.banners : DEFAULT_BANNERS).map((b) => ({ ...b, chips: [...(b.chips || []), '', '', ''].slice(0, 3) })),
      quickActions: QUICK_ACTIONS.map((q) => ({ key: q.key, label: '', image: '', ...(h.quickActions || []).find((x) => x.key === q.key) })),
    });
  }, [data]);

  const setBanner = (i, patch) => setF((s) => ({ ...s, banners: s.banners.map((b, n) => (n === i ? { ...b, ...patch } : b)) }));
  const moveBanner = (i, d) => setF((s) => {
    const banners = [...s.banners];
    [banners[i], banners[i + d]] = [banners[i + d], banners[i]];
    return { ...s, banners };
  });
  const setQuick = (key, patch) => setF((s) => ({ ...s, quickActions: s.quickActions.map((q) => (q.key === key ? { ...q, ...patch } : q)) }));

  const save = async () => {
    setSaving(true);
    try {
      await api('/admin/customer-home', { method: 'PUT', body: { ...f, banners: f.banners.map((b) => ({ ...b, chips: b.chips.filter((c) => c.trim()) })) } });
      toast.success('Customer app saved');
      reload();
      refreshBranding();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <PageShell eyebrow="System" title="Customer App" actions={<Button onClick={save} disabled={saving || !f}>{saving ? 'Saving...' : 'Save changes'}</Button>}>
      {loading || !f ? <p className="text-sm text-neutral-500">Loading...</p> : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Home greeting</CardTitle>
                <p className="text-xs text-neutral-500">Shown under "Hello, &lt;name&gt;". The app name, tagline and logo are set in Business Setup.</p>
              </CardHeader>
              <CardContent><Input value={f.subtitle} onChange={(e) => setF((s) => ({ ...s, subtitle: e.target.value }))} maxLength={200} /></CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Home tiles</CardTitle>
                <p className="text-xs text-neutral-500">The four shortcut tiles. Leave the label empty to keep the default; square transparent PNGs look best.</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {QUICK_ACTIONS.map((q) => {
                  const v = f.quickActions.find((x) => x.key === q.key);
                  return (
                    <div key={q.key} className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
                      <ImageField value={v.image} fallback={q.image} onChange={(image) => setQuick(q.key, { image })} />
                      <div className="min-w-[180px] flex-1 space-y-1.5">
                        <Label>Label</Label>
                        <Input value={v.label} placeholder={q.label} onChange={(e) => setQuick(q.key, { label: e.target.value })} maxLength={40} />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>Home banners</CardTitle>
                <Button variant="outline" size="sm" disabled={f.banners.length >= 8} onClick={() => setF((s) => ({ ...s, banners: [...s.banners, { title: '', highlight: '', chips: ['', '', ''], image: '' }] }))}><Plus className="h-4 w-4" /> Add slide</Button>
              </div>
              <p className="text-xs text-neutral-500">Slides rotate every 5 seconds. The image sits on the right; a transparent PNG about 520×360 works best.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {f.banners.length === 0 && <p className="text-sm text-neutral-500">No slides — the app falls back to the default banners.</p>}
              {f.banners.map((b, i) => (
                <div key={i} className="space-y-3 rounded-xl border p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Slide {i + 1}</p>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" disabled={i === 0} onClick={() => moveBanner(i, -1)} aria-label="Move up"><ArrowUp className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" disabled={i === f.banners.length - 1} onClick={() => moveBanner(i, 1)} aria-label="Move down"><ArrowDown className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" className="text-red-600" onClick={() => setF((s) => ({ ...s, banners: s.banners.filter((_, n) => n !== i) }))} aria-label="Remove"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  <ImageField wide value={b.image} fallback={DEFAULT_BANNERS[i % DEFAULT_BANNERS.length].image} onChange={(image) => setBanner(i, { image })} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5"><Label>Title (dark)</Label><Input value={b.title} onChange={(e) => setBanner(i, { title: e.target.value })} maxLength={80} /></div>
                    <div className="space-y-1.5"><Label>Highlight (blue)</Label><Input value={b.highlight} onChange={(e) => setBanner(i, { highlight: e.target.value })} maxLength={80} /></div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Chips (up to 3)</Label>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {b.chips.map((c, n) => <Input key={n} value={c} placeholder={`Chip ${n + 1}`} maxLength={30} onChange={(e) => setBanner(i, { chips: b.chips.map((x, m) => (m === n ? e.target.value : x)) })} />)}
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </PageShell>
  );
}
