import { useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Input, NativeSelect, Textarea } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { PageShell, DataTable } from '@/shared/components/PageShell';
import { api } from '@/shared/lib/api';
import { useApi } from '@/shared/lib/useApi';
import { useToast } from '@/shared/context/ToastContext';
import { fmtDateTime } from '@/shared/lib/format';

const AUDIENCES = [
  ['all', 'Everyone'],
  ['customer', 'Customers'],
  ['engineer', 'Engineers'],
  ['vendor_owner', 'Service Companies'],
  ['oem', 'OEMs'],
  ['admin', 'Admins'],
];
const label = Object.fromEntries(AUDIENCES);

export default function Broadcast() {
  const toast = useToast();
  const { data, reload } = useApi('/admin/broadcasts');
  const [form, setForm] = useState({ title: '', message: '', audience: 'all' });
  const [sending, setSending] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const send = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      const res = await api('/admin/broadcast', { method: 'POST', body: form });
      toast.success(`Sent to ${res.recipients} account${res.recipients === 1 ? '' : 's'}`);
      setForm({ title: '', message: '', audience: 'all' });
      reload();
    } catch (err) { toast.error(err.message); } finally { setSending(false); }
  };

  return (
    <PageShell eyebrow="Communication" title="Broadcast">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>New broadcast</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={send} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Audience</Label>
                <NativeSelect value={form.audience} onChange={(e) => set('audience', e.target.value)}>
                  {AUDIENCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input required maxLength={100} value={form.title} onChange={(e) => set('title', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Message</Label>
                <Textarea required maxLength={500} value={form.message} onChange={(e) => set('message', e.target.value)} />
              </div>
              <p className="text-xs text-neutral-500">Delivered in-app and as a push notification to the mobile apps and web panels.</p>
              <Button type="submit" disabled={sending}><Send className="mr-2 h-4 w-4" />{sending ? 'Sending...' : 'Send broadcast'}</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>History</CardTitle></CardHeader>
          <CardContent>
            <DataTable
              rows={data || []}
              empty="No broadcasts sent yet"
              columns={[
                { key: 'createdAt', label: 'Sent', render: (r) => fmtDateTime(r.createdAt) },
                { key: 'audience', label: 'Audience', render: (r) => label[r.audience] || r.audience },
                { key: 'title', label: 'Title', render: (r) => <div><p className="font-medium">{r.title}</p><p className="text-xs text-neutral-500">{r.message}</p></div> },
                { key: 'recipients', label: 'Reach', render: (r) => r.recipients },
              ]}
            />
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
