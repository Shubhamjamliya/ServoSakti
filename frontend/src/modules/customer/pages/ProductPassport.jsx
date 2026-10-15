import { useRef, useState } from 'react';
import { FileText, Plus, Upload } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input, NativeSelect } from '@/shared/components/ui/input';
import { Empty, ErrorNote, Field, KeyValue, Panel, Screen, StatusPill } from '@/shared/components/Mobile';
import { api, uploadFiles } from '@/shared/lib/api';
import { useApi } from '@/shared/lib/useApi';
import { useToast } from '@/shared/context/ToastContext';
import { fmtDate } from '@/shared/lib/format';

const EMPTY = { productId: '', brand: '', model: '', serialNumber: '', purchaseDate: '', warrantyEnd: '', invoiceUrl: '' };

export default function ProductPassport() {
  const toast = useToast();
  const { data, reload } = useApi('/products/passports?limit=100');
  const { data: catalog } = useApi('/products?limit=200');
  const [mode, setMode] = useState('list'); // list | form | review
  const [f, setF] = useState(EMPTY);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const pick = (id) => {
    const p = catalog?.items?.find((x) => x._id === id);
    setF((s) => ({ ...s, productId: id, brand: p?.brand || s.brand, model: p?.model || s.model }));
  };

  const review = (e) => {
    e.preventDefault();
    if (!f.brand || !f.model || !f.serialNumber || !f.purchaseDate) return setError('Brand, model, serial number and purchase date are required');
    setError('');
    setMode('review');
  };

  const upload = async (e) => {
    try { const [url] = await uploadFiles(e.target.files); setF((s) => ({ ...s, invoiceUrl: url })); toast.success('Invoice attached'); }
    catch (err) { toast.error(err.message); } finally { e.target.value = ''; }
  };

  const save = async () => {
    try {
      const body = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== ''));
      await api('/products/passports', { method: 'POST', body });
      toast.success('Product passport created');
      setF(EMPTY);
      setMode('list');
      reload();
    } catch (err) { setError(err.message); setMode('form'); }
  };

  if (mode === 'review') {
    return (
      <Screen title="Review details" subtitle="Check everything before saving">
        <Panel>
          <KeyValue label="Brand">{f.brand}</KeyValue><KeyValue label="Model">{f.model}</KeyValue><KeyValue label="Serial number">{f.serialNumber}</KeyValue>
          <KeyValue label="Purchase date">{fmtDate(f.purchaseDate)}</KeyValue>
          <KeyValue label="Warranty ends">{f.warrantyEnd ? fmtDate(f.warrantyEnd) : 'Calculated from the product catalog'}</KeyValue>
          <KeyValue label="Invoice">{f.invoiceUrl ? 'Attached' : 'Not attached'}</KeyValue>
        </Panel>
        <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => setMode('form')}>Edit</Button><Button className="flex-1" onClick={save}>Save passport</Button></div>
      </Screen>
    );
  }

  if (mode === 'form') {
    return (
      <Screen title="Add product" subtitle="Create a passport for your equipment">
        <form onSubmit={review} className="space-y-3">
          <Panel className="space-y-3">
            <Field label="Pick from catalog (optional)">
              <NativeSelect value={f.productId} onChange={(e) => pick(e.target.value)}>
                <option value="">Not listed — enter manually</option>
                {catalog?.items?.map((p) => <option key={p._id} value={p._id}>{p.brand} · {p.model}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Brand"><Input value={f.brand} onChange={set('brand')} required /></Field>
            <Field label="Model"><Input value={f.model} onChange={set('model')} required /></Field>
            <Field label="Serial number"><Input value={f.serialNumber} onChange={set('serialNumber')} required /></Field>
            <Field label="Purchase date"><Input type="date" value={f.purchaseDate} onChange={set('purchaseDate')} required /></Field>
            <Field label="Warranty end date (if known)"><Input type="date" value={f.warrantyEnd} onChange={set('warrantyEnd')} /></Field>
            <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={upload} />
            <Button type="button" variant="outline" className="w-full" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> {f.invoiceUrl ? 'Invoice attached — replace' : 'Upload invoice'}</Button>
          </Panel>
          <ErrorNote>{error}</ErrorNote>
          <div className="flex gap-2"><Button type="button" variant="outline" className="flex-1" onClick={() => setMode('list')}>Cancel</Button><Button className="flex-1">Review</Button></div>
        </form>
      </Screen>
    );
  }

  return (
    <Screen title="Product passport" subtitle="Your registered equipment and warranty" action={<Button size="sm" onClick={() => setMode('form')}><Plus className="h-4 w-4" /> Add</Button>}>
      {!data?.items?.length && <Empty>No products yet. Add one to see its warranty and book service faster.</Empty>}
      {(data?.items || []).map((p) => (
        <Panel key={p._id}>
          <div className="mb-1 flex items-start justify-between gap-2"><p className="font-semibold">{p.brand} {p.model}</p><StatusPill status={p.warrantyStatus} /></div>
          <KeyValue label="Serial">{p.serialNumber}</KeyValue>
          <KeyValue label="Purchased">{fmtDate(p.purchaseDate)}</KeyValue>
          <KeyValue label="Warranty ends">{fmtDate(p.warrantyEnd)}</KeyValue>
          {p.invoiceUrl && <a href={p.invoiceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm text-primary"><FileText className="h-4 w-4" /> View invoice</a>}
        </Panel>
      ))}
    </Screen>
  );
}
