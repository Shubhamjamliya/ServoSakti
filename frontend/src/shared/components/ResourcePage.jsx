import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Plus, Search } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input, NativeSelect, Textarea } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { DataTable, PageShell } from '@/shared/components/PageShell';
import { api, qs } from '@/shared/lib/api';
import { useApi } from '@/shared/lib/useApi';
import { downloadCsv } from '@/shared/lib/format';
import { useToast } from '@/shared/context/ToastContext';

const optionOf = (o) => (typeof o === 'string' ? { value: o, label: o } : o);

function RemoteOptions({ field }) {
  const { data } = useApi(`${field.endpoint}${qs({ limit: 200, ...field.params })}`);
  return (data?.items || []).map((o) => (
    <option key={o._id} value={o._id}>{field.optionLabel ? field.optionLabel(o) : o.legalName || o.name}</option>
  ));
}

function Field({ field, value, onChange }) {
  const common = { id: field.name, required: field.required !== false, value: value ?? '' };
  if (field.type === 'select' || field.type === 'remote') {
    return (
      <NativeSelect {...common} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>Select...</option>
        {field.type === 'remote' ? <RemoteOptions field={field} /> : field.options.map(optionOf).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </NativeSelect>
    );
  }
  if (field.type === 'textarea') return <Textarea {...common} onChange={(e) => onChange(e.target.value)} />;
  return (
    <Input
      {...common}
      type={field.type === 'tags' ? 'text' : field.type || 'text'}
      placeholder={field.placeholder || (field.type === 'tags' ? 'Comma separated' : undefined)}
      onChange={(e) => onChange(field.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
    />
  );
}

/**
 * Server-driven list page: debounced search, status filter, pagination, CSV export of the loaded page,
 * optional create dialog and per-row actions.
 *
 *   endpoint     GET path (list). POST goes to `createEndpoint || endpoint`.
 *   params       extra fixed query params
 *   filterKey    query param used for the dropdown filter (e.g. "status")
 *   fields       create-form definition; omit for read-only pages
 *   mapCreate    (form) => request body
 *   rowActions   ({ row, reload }) => ReactNode
 */
export default function ResourcePage({
  eyebrow, title, endpoint, params, columns, filterKey, filterLabel = 'All', filterOptions = [], fields, createLabel, createEndpoint, mapCreate,
  rowActions, extraActions, header, searchable = true, exportName, refreshKey,
}) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(query); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const path = `${endpoint}${qs({ ...params, q: debounced, page, limit: 25, ...(filterKey ? { [filterKey]: filter } : {}) })}`;
  const { data, loading, error, reload } = useApi(path);
  useEffect(() => { if (refreshKey) reload(); }, [refreshKey, reload]);
  const rows = data?.items || [];
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  const cols = useMemo(
    () => (rowActions ? [...columns, { key: '_actions', label: '', render: (row) => <div className="flex justify-end gap-2">{rowActions({ row, reload })}</div> }] : columns),
    [columns, rowActions, reload]
  );

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = Object.fromEntries(fields.map((f) => [f.name, f.type === 'tags' ? String(form[f.name] || '').split(',').map((s) => s.trim()).filter(Boolean) : form[f.name]]));
      await api(createEndpoint || endpoint, { method: 'POST', body: mapCreate ? mapCreate(body) : body });
      toast.success(`${createLabel || 'Record'} saved`);
      setOpen(false);
      setForm({});
      reload();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  return (
    <PageShell
      eyebrow={eyebrow}
      title={title}
      actions={
        <>
          {extraActions}
          <Button variant="outline" disabled={!rows.length} onClick={() => downloadCsv(exportName || title, columns.filter((c) => c.key !== '_actions'), rows)}>
            <Download className="h-4 w-4" /> Export
          </Button>
          {fields && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> {createLabel || 'Add'}</Button>}
        </>
      }
    >
      {header}
      {(searchable || filterKey) && (
        <div className="flex flex-col gap-3 sm:flex-row">
          {searchable && (
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <Input className="pl-9" placeholder={`Search ${title.toLowerCase()}...`} value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          )}
          {filterKey && (
            <NativeSelect className="sm:w-52" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}>
              <option value="all">{filterLabel}</option>
              {filterOptions.map(optionOf).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </NativeSelect>
          )}
        </div>
      )}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error} <button className="ml-2 underline" onClick={reload}>Retry</button>
        </div>
      ) : (
        <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <DataTable columns={cols} rows={rows} empty={loading ? 'Loading...' : 'No records found'} />
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>{data ? `${data.total} record${data.total === 1 ? '' : 's'}` : ' '}</span>
        {pages > 1 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <span>Page {page} of {pages}</span>
            <Button variant="outline" size="icon" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        )}
      </div>

      {fields && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{createLabel || 'Add'}</DialogTitle></DialogHeader>
            <form onSubmit={save} className="space-y-4">
              {fields.map((f) => (
                <div key={f.name} className="space-y-1.5">
                  <Label htmlFor={f.name}>{f.label}</Label>
                  <Field field={f} value={form[f.name]} onChange={(v) => setForm((s) => ({ ...s, [f.name]: v }))} />
                </div>
              ))}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </PageShell>
  );
}
