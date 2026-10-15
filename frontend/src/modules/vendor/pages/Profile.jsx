import { useEffect, useRef, useState } from 'react';
import { FileText, Upload } from 'lucide-react';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Input, NativeSelect } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { PageShell } from '@/shared/components/PageShell';
import { api, uploadFiles } from '@/shared/lib/api';
import { useApi } from '@/shared/lib/useApi';
import { useToast } from '@/shared/context/ToastContext';
import { humanize } from '@/shared/lib/format';

const csv = (a) => (a || []).join(', ');
const list = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const KYC_TYPES = ['GST certificate', 'PAN card', 'Company registration', 'Address proof', 'Authorization letter'];

export default function Profile() {
  const toast = useToast();
  const { data, reload } = useApi('/auth/me');
  const [f, setF] = useState(null);
  const [saving, setSaving] = useState(false);
  const [docType, setDocType] = useState(KYC_TYPES[0]);
  const fileRef = useRef(null);
  const co = data?.company;

  useEffect(() => {
    if (co) setF({ legalName: co.legalName || '', address: co.address || '', city: co.city || '', phone: co.phone || '', email: co.email || '', gstin: co.gstin || '', serviceAreas: csv(co.serviceAreas), authorizedBrands: csv(co.authorizedBrands), isBackup: !!co.isBackup });
  }, [co]);

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api('/companies/me', { method: 'PATCH', body: { ...f, serviceAreas: list(f.serviceAreas), authorizedBrands: list(f.authorizedBrands) } });
      toast.success('Company profile saved');
      reload();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const upload = async (e) => {
    const files = e.target.files;
    if (!files?.length) return;
    try {
      const urls = await uploadFiles(files);
      await api('/companies/me', { method: 'PATCH', body: { kyc: [...(co.kyc || []), ...urls.map((url) => ({ docType, url }))] } });
      toast.success('KYC document uploaded — pending admin verification');
      reload();
    } catch (err) { toast.error(err.message); } finally { e.target.value = ''; }
  };

  if (!f) return <PageShell eyebrow="Company" title="Company Profile"><p className="text-sm text-neutral-500">Loading...</p></PageShell>;

  return (
    <PageShell eyebrow="Company" title="Company Profile" actions={<Badge>{humanize(co.status)}</Badge>}>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Business details</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="n">Legal / company name</Label><Input id="n" required value={f.legalName} onChange={set('legalName')} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="a">Address</Label><Input id="a" value={f.address} onChange={set('address')} /></div>
              <div className="space-y-1.5"><Label htmlFor="c">City</Label><Input id="c" value={f.city} onChange={set('city')} /></div>
              <div className="space-y-1.5"><Label htmlFor="g">GSTIN</Label><Input id="g" value={f.gstin} onChange={set('gstin')} /></div>
              <div className="space-y-1.5"><Label htmlFor="p">Login phone</Label><Input id="p" value={f.phone} disabled title="This is your login id — contact Servoshakti to change it" /></div>
              <div className="space-y-1.5"><Label htmlFor="e">Email</Label><Input id="e" type="email" value={f.email} onChange={set('email')} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="s">Service areas (cities, comma separated)</Label><Input id="s" value={f.serviceAreas} onChange={set('serviceAreas')} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="b">Brands you are certified for</Label><Input id="b" value={f.authorizedBrands} onChange={set('authorizedBrands')} /></div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="bk">Backup / emergency coverage</Label>
                <NativeSelect id="bk" value={String(f.isBackup)} onChange={(e) => setF((s) => ({ ...s, isBackup: e.target.value === 'true' }))}>
                  <option value="false">No — only normal dispatch</option>
                  <option value="true">Yes — OEMs may use us as an emergency partner</option>
                </NativeSelect>
              </div>
              <div className="sm:col-span-2"><Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save profile'}</Button></div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>KYC documents</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {(co.kyc || []).map((k) => (
                <a key={k.url} href={k.url} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-muted">
                  <span className="flex items-center gap-2"><FileText className="h-4 w-4 text-neutral-500" />{k.docType}</span>
                  <Badge tone={k.verified ? 'green' : 'amber'}>{k.verified ? 'Verified' : 'Pending'}</Badge>
                </a>
              ))}
              {!co.kyc?.length && <p className="text-sm text-neutral-500">No documents uploaded yet.</p>}
            </div>
            <div className="space-y-2 border-t pt-4">
              <NativeSelect value={docType} onChange={(e) => setDocType(e.target.value)}>{KYC_TYPES.map((t) => <option key={t}>{t}</option>)}</NativeSelect>
              <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={upload} />
              <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Upload document</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
