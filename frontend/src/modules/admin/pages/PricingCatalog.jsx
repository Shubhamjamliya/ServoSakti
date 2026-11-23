import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import ResourcePage from '@/shared/components/ResourcePage';
import Tabs from '@/shared/components/Tabs';
import { api } from '@/shared/lib/api';
import { useToast } from '@/shared/context/ToastContext';
import { JOB_TYPES, labelOf } from '@/shared/lib/format';
import { inr } from '@/shared/lib/utils';

const SUBTYPE_FIELD = { name: 'subtypeId', label: 'Product type', type: 'remote', endpoint: '/catalog/subtypes', optionLabel: (o) => `${o.category} · ${o.name}` };
const COVERED_OPTIONS = [
  { value: 'none', label: 'Always charged (consumable / material)' },
  { value: 'warranty', label: 'Free under OEM warranty only' },
  { value: 'cmc', label: 'Free under CMC only' },
  { value: 'both', label: 'Free under OEM warranty and CMC' },
];
const coveredBy = (v) => ({ none: [], warranty: ['warranty'], cmc: ['cmc'], both: ['warranty', 'cmc'] }[v] || []);
const active = { key: 'active', label: 'Status', render: (r) => <Badge tone={r.active ? 'green' : 'gray'}>{r.active ? 'Active' : 'Inactive'}</Badge> };

/** Row actions shared by every catalogue: change the price, (de)activate, delete. */
function useRowActions(resource, priceKey = 'price') {
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const patch = async (row, body) => {
    try { await api(`/catalog/${resource}/${row._id}`, { method: 'PATCH', body }); setVersion((v) => v + 1); } catch (e) { toast.error(e.message); }
  };
  const remove = async (row) => {
    if (!window.confirm('Delete this row? Bookings already made keep their price.')) return;
    try { await api(`/catalog/${resource}/${row._id}`, { method: 'DELETE' }); setVersion((v) => v + 1); } catch (e) { toast.error(e.message); }
  };
  const editPrice = (row) => {
    const value = window.prompt('New price (₹, before GST)', row[priceKey]);
    if (value !== null && value !== '' && !Number.isNaN(Number(value))) patch(row, { [priceKey]: Number(value) });
  };
  const rowActions = ({ row }) => (
    <>
      {priceKey && <Button size="sm" variant="outline" onClick={() => editPrice(row)}>Edit price</Button>}
      <Button size="sm" variant="outline" onClick={() => patch(row, { active: !row.active })}>{row.active ? 'Deactivate' : 'Activate'}</Button>
      <Button size="sm" variant="ghost" className="text-red-700" onClick={() => remove(row)}>Delete</Button>
    </>
  );
  return { version, rowActions };
}

function Subtypes() {
  const { version, rowActions } = useRowActions('subtypes', null);
  return (
    <ResourcePage
      eyebrow="Pricing" title="Product Types" endpoint="/catalog/subtypes" refreshKey={version} createLabel="Add product type" rowActions={rowActions}
      columns={[{ key: 'category', label: 'Category' }, { key: 'name', label: 'Product type' }, active]}
      fields={[{ name: 'category', label: 'Category (e.g. Air Conditioner)' }, { name: 'name', label: 'Product type (e.g. Split AC 1.5 Ton)' }]}
    />
  );
}

function PriceCards() {
  const { version, rowActions } = useRowActions('price-cards');
  const toast = useToast();
  const editVisit = async (row) => {
    const value = window.prompt('New visit / inspection charge (₹)', row.visitCharge);
    if (value === null || value === '') return;
    try { await api(`/catalog/price-cards/${row._id}`, { method: 'PATCH', body: { visitCharge: Number(value) } }); toast.success('Saved'); } catch (e) { toast.error(e.message); }
  };
  return (
    <ResourcePage
      eyebrow="Pricing" title="Customer Prices" endpoint="/catalog/price-cards" refreshKey={version} createLabel="Add price"
      filterKey="jobType" filterLabel="All services" filterOptions={JOB_TYPES}
      rowActions={(p) => <>{rowActions(p)}<Button size="sm" variant="outline" onClick={() => editVisit(p.row)}>Visit charge</Button></>}
      columns={[
        { key: 'category', label: 'Category' },
        { key: 'subtypeName', label: 'Product type' },
        { key: 'jobType', label: 'Service', render: (r) => labelOf(JOB_TYPES, r.jobType), csv: (r) => labelOf(JOB_TYPES, r.jobType) },
        { key: 'brand', label: 'Brand', render: (r) => r.brand || 'All brands' },
        { key: 'price', label: 'Service price', render: (r) => inr(r.price) },
        { key: 'visitCharge', label: 'Visit charge', render: (r) => inr(r.visitCharge) },
        active,
      ]}
      fields={[
        SUBTYPE_FIELD,
        { name: 'jobType', label: 'Service', type: 'select', options: JOB_TYPES },
        { name: 'brand', label: 'Brand (leave empty for all brands)', required: false },
        { name: 'price', label: 'Service / labour price (₹, before GST)', type: 'number' },
        { name: 'visitCharge', label: 'Visit / inspection charge (₹)', type: 'number' },
      ]}
    />
  );
}

function AddOns() {
  const { version, rowActions } = useRowActions('add-ons');
  return (
    <ResourcePage
      eyebrow="Pricing" title="Add-ons" endpoint="/catalog/add-ons" refreshKey={version} createLabel="Add add-on" rowActions={rowActions}
      columns={[
        { key: 'name', label: 'Add-on' }, { key: 'description', label: 'Description' }, { key: 'price', label: 'Price', render: (r) => inr(r.price) },
        { key: 'jobTypes', label: 'Services', render: (r) => (r.jobTypes?.length ? r.jobTypes.map((j) => labelOf(JOB_TYPES, j)).join(', ') : 'All') },
        active,
      ]}
      fields={[
        { name: 'name', label: 'Name (e.g. Jet-pump deep cleaning)' },
        { name: 'description', label: 'Description', required: false },
        { name: 'price', label: 'Price (₹, before GST)', type: 'number' },
        { ...SUBTYPE_FIELD, label: 'Only for product type (optional)', required: false },
        { name: 'jobType', label: 'Only for service (optional)', type: 'select', options: JOB_TYPES, required: false },
      ]}
      mapCreate={({ subtypeId, jobType, ...rest }) => ({ ...rest, subtypeIds: subtypeId ? [subtypeId] : [], jobTypes: jobType ? [jobType] : [] })}
    />
  );
}

function Parts() {
  const { version, rowActions } = useRowActions('parts');
  return (
    <ResourcePage
      eyebrow="Pricing" title="Parts & Extras" endpoint="/catalog/parts" refreshKey={version} createLabel="Add part" rowActions={rowActions}
      columns={[
        { key: 'name', label: 'Part / extra' }, { key: 'code', label: 'Code' },
        { key: 'price', label: 'Price', render: (r) => `${inr(r.price)} / ${r.unit}` },
        { key: 'coveredBy', label: 'Free under', render: (r) => (r.coveredBy?.length ? r.coveredBy.map((c) => c.toUpperCase()).join(', ') : 'Always charged') },
        { key: 'partWarrantyDays', label: 'Part warranty', render: (r) => `${r.partWarrantyDays} days` },
        active,
      ]}
      fields={[
        { name: 'name', label: 'Name (e.g. PCB, Gas refill, Copper pipe)' },
        { name: 'code', label: 'Code (use GAS for gas refill)', required: false },
        { name: 'unit', label: 'Unit', type: 'select', options: ['piece', 'ft', 'kg', 'set'] },
        { name: 'price', label: 'Price per unit (₹, before GST)', type: 'number' },
        { name: 'covered', label: 'Coverage', type: 'select', options: COVERED_OPTIONS },
        { name: 'partWarrantyDays', label: 'Part warranty (days)', type: 'number', required: false },
        { ...SUBTYPE_FIELD, label: 'Only for product type (optional)', required: false },
      ]}
      mapCreate={({ covered, subtypeId, partWarrantyDays, ...rest }) => ({ ...rest, coveredBy: coveredBy(covered), subtypeIds: subtypeId ? [subtypeId] : [], ...(partWarrantyDays !== '' && partWarrantyDays != null && { partWarrantyDays }) })}
    />
  );
}

export function Plans({ eyebrow = 'Pricing', oem = false }) {
  const { version, rowActions } = useRowActions('plans');
  return (
    <ResourcePage
      eyebrow={eyebrow} title="AMC / CMC Plans" endpoint="/catalog/plans" refreshKey={version} createLabel="Add plan" rowActions={rowActions}
      filterKey="type" filterLabel="AMC and CMC" filterOptions={[{ value: 'amc', label: 'AMC' }, { value: 'cmc', label: 'CMC' }]}
      columns={[
        { key: 'name', label: 'Plan' },
        { key: 'type', label: 'Type', render: (r) => <Badge tone={r.type === 'cmc' ? 'green' : 'blue'}>{r.type.toUpperCase()}</Badge>, csv: (r) => r.type },
        { key: 'subtypeName', label: 'Product type' },
        { key: 'price', label: 'Price', render: (r) => inr(r.price) },
        { key: 'durationMonths', label: 'Duration', render: (r) => `${r.durationMonths} months` },
        { key: 'pmVisits', label: 'PM visits' },
        { key: 'waitingDays', label: 'Breakdown cover after', render: (r) => `${r.waitingDays} days` },
        { key: 'seller', label: 'Sold by', render: (r) => (r.seller === 'oem' ? `Brand${r.brand ? ` (${r.brand})` : ''}` : 'Platform') },
        active,
      ]}
      fields={[
        { name: 'name', label: 'Plan name (e.g. CMC Split 1.5 Ton – 1 year)' },
        { name: 'type', label: 'Type', type: 'select', options: [{ value: 'amc', label: 'AMC — labour free, parts charged' }, { value: 'cmc', label: 'CMC — labour and parts free' }] },
        SUBTYPE_FIELD,
        { name: 'price', label: 'Price (₹)', type: 'number' },
        { name: 'durationMonths', label: 'Duration (months)', type: 'number' },
        { name: 'pmVisits', label: 'PM visits included', type: 'number' },
        { name: 'waitingDays', label: 'Breakdown cover starts after (days)', type: 'number' },
        { name: 'gasIncluded', label: 'Gas refill included', type: 'select', options: [{ value: 'false', label: 'No' }, { value: 'true', label: 'Yes' }] },
        { name: 'transferable', label: 'Moves to a new owner', type: 'select', options: [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] },
        ...(oem ? [{ name: 'brand', label: 'Brand' }] : []),
      ]}
      mapCreate={({ gasIncluded, transferable, ...rest }) => ({ ...rest, gasIncluded: gasIncluded === 'true', transferable: transferable !== 'false' })}
    />
  );
}

const TABS = [
  { value: 'subtypes', label: 'Product types', C: Subtypes },
  { value: 'prices', label: 'Customer prices', C: PriceCards },
  { value: 'addons', label: 'Add-ons', C: AddOns },
  { value: 'parts', label: 'Parts & extras', C: Parts },
  { value: 'plans', label: 'AMC / CMC', C: Plans },
];

export default function PricingCatalog() {
  const [tab, setTab] = useState('subtypes');
  const { C } = TABS.find((t) => t.value === tab);
  return (
    <div className="space-y-4">
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      <C />
    </div>
  );
}
