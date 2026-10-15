import { useEffect, useState } from 'react';
import { AlertTriangle, Cloud, HardDrive, Loader2, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { PageShell } from '@/shared/components/PageShell';
import { api } from '@/shared/lib/api';
import { useApi } from '@/shared/lib/useApi';
import { useToast } from '@/shared/context/ToastContext';
import { cn, num } from '@/shared/lib/utils';

const PROVIDERS = [
  { key: 'local', label: 'Server folder (VPS)', icon: HardDrive, description: 'Images are saved in this server\'s upload folder and served from /uploads' },
  { key: 'cloudinary', label: 'Cloudinary', icon: Cloud, description: 'Images are uploaded to your Cloudinary account (CDN-hosted)' },
];

export default function DeveloperSettings() {
  const toast = useToast();
  const { data, loading, error } = useApi('/admin/developer');
  const { data: counts, loading: countsLoading, reload: reloadCounts } = useApi('/admin/developer/operational-data');
  const [provider, setProvider] = useState('local');
  const [saving, setSaving] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [clearing, setClearing] = useState(false);
  useEffect(() => { if (data) setProvider(data.developerSettings?.imageUploadProvider || 'local'); }, [data]);

  const choose = async (key) => {
    if (key === provider || saving) return;
    setSaving(true);
    try {
      await api('/admin/developer', { method: 'PUT', body: { imageUploadProvider: key } });
      setProvider(key);
      toast.success(`New uploads now go to ${key === 'cloudinary' ? 'Cloudinary' : 'the server folder'}`);
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };

  const clear = async () => {
    setClearing(true);
    try {
      const r = await api('/admin/developer/clear-operational-data', { method: 'POST', body: { confirm: phrase } });
      toast.success(`Cleared ${num(r.total)} records`);
      setPhrase('');
      reloadCounts();
    } catch (e) { toast.error(e.message); } finally { setClearing(false); }
  };

  const ready = counts && phrase === counts.confirmPhrase;

  return (
    <PageShell eyebrow="System" title="Developer Settings">
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {loading ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Image upload provider</CardTitle>
              <p className="text-xs text-neutral-500">Where uploaded images (logos, product and job photos) are stored. Switching affects new uploads only; PDFs always stay on the server folder.</p>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {PROVIDERS.map((p) => {
                const Icon = p.icon;
                const active = provider === p.key;
                const disabled = p.key === 'cloudinary' && !data?.cloudinaryConfigured;
                return (
                  <button
                    key={p.key} type="button" disabled={disabled || saving} onClick={() => choose(p.key)}
                    className={cn('flex items-start gap-3 rounded-xl border-2 p-4 text-left transition', active ? 'border-primary bg-primary/5' : 'border-neutral-200 hover:border-neutral-300', disabled && 'cursor-not-allowed opacity-50')}
                  >
                    <Icon className="mt-0.5 h-5 w-5 shrink-0" />
                    <span className="flex-1">
                      <span className="flex items-center gap-2 font-semibold">{p.label}{active && <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white">Active</span>}</span>
                      <span className="mt-0.5 block text-xs text-neutral-500">{p.description}</span>
                      {disabled && <span className="mt-1 flex items-center gap-1 text-xs text-amber-700"><AlertTriangle className="h-3 w-3" /> CLOUDINARY_* keys are missing on the server</span>}
                    </span>
                  </button>
                );
              })}
            </CardContent>
            <CardContent className="pt-0 text-xs text-neutral-500">
              Server folder: UPLOAD_DIR / UPLOAD_PATH if set, otherwise <code className="rounded bg-neutral-100 px-1">backend/uploads</code> in development and <code className="rounded bg-neutral-100 px-1">/var/www/uploads</code> in production.
            </CardContent>
          </Card>

          <Card className="border-red-200">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-red-700"><ShieldAlert className="h-5 w-5" /> Clear operational data</CardTitle>
                <button onClick={reloadCounts} disabled={countsLoading} aria-label="Refresh counts" className="text-neutral-500 hover:text-neutral-800"><RefreshCw className={cn('h-4 w-4', countsLoading && 'animate-spin')} /></button>
              </div>
              <p className="text-xs text-neutral-500">Removes service requests, dispatch logs, field reports, payouts, incentives, disputes, day logs, AI complaints and notifications. Accounts, products, passports, rate cards, authorizations and settings are kept. SR numbering restarts.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {counts && (
                <div className="grid gap-2 sm:grid-cols-3">
                  {counts.groups.map((g) => (
                    <div key={g.key} className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2">
                      <span className="text-xs text-neutral-600">{g.label}</span>
                      <span className={cn('text-sm font-bold', g.count ? 'text-neutral-900' : 'text-neutral-400')}>{num(g.count)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-4">
                <p className="text-xs text-red-800">This cannot be undone. Type <span className="font-mono font-bold">{counts?.confirmPhrase}</span> to continue.</p>
                <input value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder="Type the phrase to confirm" className="h-10 w-full rounded-lg border border-red-300 bg-white px-3 text-sm outline-none focus:border-red-500" />
                <Button variant="destructive" className="w-full" disabled={!ready || clearing || counts?.total === 0} onClick={clear}>
                  {clearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} {clearing ? 'Clearing...' : `Clear ${counts ? num(counts.total) : ''} records`}
                </Button>
                {counts?.total === 0 && <p className="text-center text-xs text-neutral-500">There is no operational data to clear.</p>}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </PageShell>
  );
}
