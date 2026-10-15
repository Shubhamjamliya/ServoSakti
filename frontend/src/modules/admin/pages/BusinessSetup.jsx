import { useEffect, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { PageShell } from '@/shared/components/PageShell';
import { api } from '@/shared/lib/api';
import { refreshBranding } from '@/shared/lib/useBranding';
import { useApi } from '@/shared/lib/useApi';
import { useToast } from '@/shared/context/ToastContext';

const TEXT = [
  ['companyName', 'Company name', 'sm:col-span-2'],
  ['email', 'Email'],
  ['phoneNumber', 'Phone number'],
  ['address', 'Address', 'sm:col-span-2'],
  ['state', 'State'],
  ['pincode', 'Pincode'],
  ['region', 'Region / country'],
];
const LOGOS = [
  ['logo', 'Main logo', 'Admin panel, login pages and sidebar'],
  ['oemLogo', 'OEM logo', 'OEM portal'],
  ['vendorLogo', 'Service company logo', 'Service company portal'],
  ['engineerLogo', 'Engineer logo', 'Engineer app'],
  ['customerLogo', 'Customer logo', 'Customer app'],
  ['favicon', 'Favicon', 'Browser tab icon (square)'],
];

function LogoPicker({ label, hint, current, file, removed, onPick, onRemove }) {
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    if (!file) { setPreview(null); return undefined; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const shown = preview || (!removed && current);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-neutral-200 p-3">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-neutral-50">
        {shown ? <img src={shown} alt={label} className="h-full w-full object-contain" /> : <ImagePlus className="h-5 w-5 text-neutral-400" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{label}</p>
        <p className="truncate text-xs text-neutral-500">{hint}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <label className="cursor-pointer rounded-lg border px-2.5 py-1 text-xs font-semibold hover:bg-neutral-50">
            Choose<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { onPick(e.target.files[0] || null); e.target.value = ''; }} />
          </label>
          {shown && <button type="button" onClick={onRemove} className="flex items-center gap-1 text-xs text-red-600"><Trash2 className="h-3 w-3" /> Remove</button>}
        </div>
      </div>
    </div>
  );
}

export default function BusinessSetup() {
  const toast = useToast();
  const { data, loading, reload } = useApi('/admin/business-setup');
  const [f, setF] = useState(null);
  const [files, setFiles] = useState({});
  const [removed, setRemoved] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (data) setF(data.businessSetup); }, [data]);

  const save = async () => {
    setSaving(true);
    try {
      const form = new FormData();
      TEXT.forEach(([k]) => form.append(k, f[k] ?? ''));
      form.append('phoneCountryCode', f.phoneCountryCode || '+91');
      Object.entries(files).forEach(([k, file]) => form.append(k, file));
      Object.keys(removed).filter((k) => removed[k] && !files[k]).forEach((k) => form.append(`remove_${k}`, 'true'));
      await api('/admin/business-setup', { method: 'PUT', body: form });
      setFiles({});
      setRemoved({});
      toast.success('Business setup saved');
      reload();
      refreshBranding();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <PageShell eyebrow="System" title="Business Setup" actions={<Button onClick={save} disabled={saving || !f}>{saving ? 'Saving...' : 'Save changes'}</Button>}>
      {loading || !f ? <p className="text-sm text-neutral-500">Loading...</p> : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Company information</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {TEXT.map(([k, label, span]) => (
                <div key={k} className={`space-y-1.5 ${span || ''}`}>
                  <Label htmlFor={k}>{label}</Label>
                  <Input id={k} value={f[k] ?? ''} onChange={(e) => setF((s) => ({ ...s, [k]: e.target.value }))} />
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Logos</CardTitle>
              <p className="text-xs text-neutral-500">Stored with the provider chosen in Developer Settings. Other portals fall back to the main logo.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {LOGOS.map(([k, label, hint]) => (
                <LogoPicker
                  key={k} label={label} hint={hint} current={f[k]} file={files[k]} removed={removed[k]}
                  onPick={(file) => { if (!file) return; setFiles((s) => ({ ...s, [k]: file })); setRemoved((s) => ({ ...s, [k]: false })); }}
                  onRemove={() => { setFiles((s) => { const rest = { ...s }; delete rest[k]; return rest; }); setRemoved((s) => ({ ...s, [k]: true })); }}
                />
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </PageShell>
  );
}
