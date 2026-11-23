import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  Edit2,
  Factory,
  Home as HomeIcon,
  LocateFixed,
  MapPin,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import MapPicker from '@/shared/components/MapPicker';
import { api } from '@/shared/lib/api';
import { useApi } from '@/shared/lib/useApi';
import { useToast } from '@/shared/context/ToastContext';
import { cn } from '@/shared/lib/utils';

const EMPTY_ADDR = {
  label: 'Home',
  line: '',
  landmark: '',
  city: '',
  state: '',
  pincode: '',
  lat: null,
  lng: null,
  isDefault: false,
};

const ADDRESS_TAGS = [
  { id: 'Home', label: 'Home', icon: HomeIcon },
  { id: 'Office', label: 'Office', icon: Building2 },
  { id: 'Site', label: 'Site / Plant', icon: Factory },
  { id: 'Other', label: 'Other', icon: MapPin },
];

export default function Addresses() {
  const toast = useToast();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { data: me, reload, loading } = useApi('/customers/me');

  const [mode, setMode] = useState(null); // null | 'add' | 'edit'
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_ADDR);
  const [pinVerified, setPinVerified] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Confirm delete dialog
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const addresses = me?.addresses || [];
  const maxReached = addresses.length >= 3;

  useEffect(() => {
    if (params.get('action') === 'add-address' && !maxReached) {
      startAdd();
    }
  }, [params, maxReached]);

  const startAdd = () => {
    if (maxReached) {
      toast.error('You can save up to 3 addresses. Please edit or delete an existing address.');
      return;
    }
    setForm({ ...EMPTY_ADDR, isDefault: addresses.length === 0 });
    setPinVerified(false);
    setError('');
    setEditingId(null);
    setMode('add');
  };

  const startEdit = (addr) => {
    setForm({
      label: addr.label || 'Home',
      line: addr.line || '',
      landmark: addr.landmark || '',
      city: addr.city || '',
      state: addr.state || '',
      pincode: addr.pincode || '',
      lat: addr.lat,
      lng: addr.lng,
      isDefault: !!addr.isDefault,
    });
    setPinVerified(addr.lat != null && addr.lng != null);
    setError('');
    setEditingId(addr._id);
    setMode('edit');
  };

  const handleMapPick = (place) => {
    if (place?.lat != null && place?.lng != null) {
      setPinVerified(true);
      setError('');
      setForm((prev) => ({
        ...prev,
        lat: place.lat,
        lng: place.lng,
        line: place.line || prev.line,
        city: place.city || prev.city,
        state: place.state || prev.state,
        pincode: place.pincode || prev.pincode,
      }));
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!pinVerified || form.lat == null || form.lng == null) {
      setError('Please select a suggested place or drop a pin on the map. Only verified map coordinates can be saved.');
      return;
    }
    if (!form.line.trim() || !form.city.trim()) {
      setError('Address line and City are required.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      if (mode === 'edit' && editingId) {
        await api(`/customers/me/addresses/${editingId}`, {
          method: 'PATCH',
          body: form,
        });
        toast.success('Address updated successfully');
      } else {
        await api('/customers/me/addresses', {
          method: 'POST',
          body: form,
        });
        toast.success('Address saved successfully');
      }
      setMode(null);
      setForm(EMPTY_ADDR);
      reload();
    } catch (err) {
      setError(err.message || 'Failed to save address');
      toast.error(err.message || 'Failed to save address');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api(`/customers/me/addresses/${deleteId}`, { method: 'DELETE' });
      toast.success('Address deleted');
      setDeleteId(null);
      reload();
    } catch (err) {
      toast.error(err.message || 'Failed to delete address');
    } finally {
      setDeleting(false);
    }
  };

  const handleSetDefault = async (addrId) => {
    try {
      await api(`/customers/me/addresses/${addrId}`, {
        method: 'PATCH',
        body: { isDefault: true },
      });
      toast.success('Default address updated');
      reload();
    } catch (err) {
      toast.error(err.message || 'Failed to update default address');
    }
  };

  if (loading && !me) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-10 rounded-xl bg-[#e8eef8]" />
        <div className="h-44 rounded-2xl bg-[#e8eef8]" />
        <div className="h-32 rounded-2xl bg-[#e8eef8]" />
      </div>
    );
  }

  // --- Sub-View: Add or Edit Form with Map ---
  if (mode) {
    return (
      <div className="w-full max-w-full overflow-hidden space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e2e8f0] pb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setMode(null);
                setForm(EMPTY_ADDR);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-white border border-[#e2e8f0] text-[#5d667a] hover:bg-[#f8fafc]"
              aria-label="Back to addresses list"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h2 className="text-[18px] font-bold text-[#0b1324] leading-tight">
                {mode === 'edit' ? 'Edit Address' : 'Add New Address'}
              </h2>
              <p className="text-[12px] text-[#5d667a]">
                Select a suggested place or drop a pin on the map
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {/* Map & Autocomplete Picker */}
          <div className="rounded-2xl border border-[#e2e8f0] bg-white p-3.5 shadow-sm space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-bold uppercase tracking-wider text-[#0b1324] flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-[#1456d8]" /> 1. Pinpoint Location *
              </span>
              {pinVerified ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  <CheckCircle2 className="h-3 w-3" /> Pin Verified
                </span>
              ) : (
                <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full font-medium">
                  Select pin on map
                </span>
              )}
            </div>

            <MapPicker
              value={form.lat != null ? { lat: form.lat, lng: form.lng } : null}
              onPick={handleMapPick}
              height={240}
            />

            {!pinVerified && (
              <p className="text-[11.5px] text-[#6b7280] italic">
                * Search your area/building above, click the map to place a pin, or tap "Use my current location".
              </p>
            )}
          </div>

          {/* Address Details Fields */}
          <div className="rounded-2xl border border-[#e2e8f0] bg-white p-4 shadow-sm space-y-3.5">
            <span className="text-[12px] font-bold uppercase tracking-wider text-[#0b1324] block">
              2. Address Details
            </span>

            {/* Address Tag Selector */}
            <div>
              <label className="text-[12px] font-semibold text-[#475467] block mb-1.5">Save As</label>
              <div className="grid grid-cols-4 gap-1.5">
                {ADDRESS_TAGS.map((tag) => {
                  const Icon = tag.icon;
                  const active = form.label === tag.id || (tag.id === 'Other' && !['Home', 'Office', 'Site'].includes(form.label));
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => setForm((s) => ({ ...s, label: tag.id }))}
                      className={cn(
                        'flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl border text-center transition text-[11.5px] font-semibold',
                        active
                          ? 'border-[#1456d8] bg-[#eff5ff] text-[#1456d8] shadow-sm'
                          : 'border-[#e2e8f0] bg-white text-[#5d667a] hover:bg-[#f8fafc]'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="truncate w-full">{tag.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* If Other, custom label */}
            {!['Home', 'Office', 'Site'].includes(form.label) && (
              <div>
                <label className="text-[12px] font-semibold text-[#475467] block mb-1">Custom Label</label>
                <Input
                  value={form.label}
                  placeholder="e.g. Workshop, Warehouse 2"
                  onChange={(e) => setForm((s) => ({ ...s, label: e.target.value }))}
                  maxLength={30}
                />
              </div>
            )}

            {/* Address Line */}
            <div>
              <label className="text-[12px] font-semibold text-[#475467] block mb-1">
                Complete Street Address / Building / Flat *
              </label>
              <Input
                value={form.line}
                onChange={(e) => setForm((s) => ({ ...s, line: e.target.value }))}
                placeholder="Building no., street name, industrial area"
                required
              />
            </div>

            {/* Landmark */}
            <div>
              <label className="text-[12px] font-semibold text-[#475467] block mb-1">
                Nearby Landmark (Optional)
              </label>
              <Input
                value={form.landmark}
                onChange={(e) => setForm((s) => ({ ...s, landmark: e.target.value }))}
                placeholder="e.g. Opposite Metro Station, Behind Tech Park"
              />
            </div>

            {/* City & State & Pincode (Structured) */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[12px] font-semibold text-[#475467] block mb-1">City *</label>
                <Input
                  value={form.city}
                  onChange={(e) => setForm((s) => ({ ...s, city: e.target.value }))}
                  placeholder="e.g. Indore"
                  required
                />
              </div>
              <div>
                <label className="text-[12px] font-semibold text-[#475467] block mb-1">Pincode</label>
                <Input
                  value={form.pincode}
                  onChange={(e) => setForm((s) => ({ ...s, pincode: e.target.value }))}
                  placeholder="e.g. 452010"
                  maxLength={6}
                />
              </div>
            </div>

            {/* Default Address Checkbox */}
            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setForm((s) => ({ ...s, isDefault: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-[#1456d8] focus:ring-[#1456d8]"
              />
              <span className="text-[13px] font-medium text-[#0b1324]">Set as default service address</span>
            </label>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 p-3 text-[12.5px] text-red-700 flex items-start gap-2 border border-red-200">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-2.5 pt-1">
            <Button
              type="button"
              variant="outline"
              className="flex-1 rounded-xl"
              onClick={() => {
                setMode(null);
                setForm(EMPTY_ADDR);
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || !pinVerified}
              className="flex-1 rounded-xl bg-[#1456d8] hover:bg-[#1149b8] font-semibold text-white shadow-sm disabled:opacity-50"
            >
              {saving ? 'Saving...' : mode === 'edit' ? 'Update Address' : 'Save Address'}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  // --- Main Address List View ---
  return (
    <div className="w-full max-w-full overflow-hidden space-y-4">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-[#e2e8f0] pb-3">
        <div className="flex items-center gap-2.5">
          <Link
            to="/customer/profile"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-[#e2e8f0] text-[#5d667a] hover:bg-[#f8fafc]"
            aria-label="Back to profile"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-[20px] font-bold tracking-tight text-[#0b1324]">Saved Addresses</h1>
            <p className="text-[12px] text-[#5d667a]">
              Manage up to 3 verified service locations
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={cn(
              'rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
              maxReached ? 'bg-amber-100 text-amber-800' : 'bg-[#eef2f8] text-[#5d667a]'
            )}
          >
            {addresses.length} / 3
          </span>

          <Button
            size="sm"
            disabled={maxReached}
            onClick={startAdd}
            className="h-8 gap-1 rounded-xl bg-[#1456d8] hover:bg-[#1149b8] text-xs font-semibold text-white shadow-sm disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>
      </div>

      {maxReached && (
        <p className="text-[11.5px] text-amber-800 bg-amber-50 rounded-xl px-3 py-2 font-medium flex items-center gap-1.5 border border-amber-200">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
          Maximum 3 service addresses reached. Edit or remove an existing address to change your location.
        </p>
      )}

      {/* Address Cards */}
      {addresses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#d3dcee] bg-white p-8 text-center">
          <MapPin className="mx-auto h-10 w-10 text-[#9aa5b8]" />
          <h3 className="mt-2 text-[15px] font-bold text-[#0b1324]">No Saved Addresses</h3>
          <p className="text-[12px] text-[#5d667a] mt-1 max-w-xs mx-auto">
            Save up to 3 verified map addresses (Home, Office, Site) for instant field service booking.
          </p>
          <Button
            size="sm"
            onClick={startAdd}
            className="mt-4 gap-1.5 rounded-xl bg-[#1456d8] text-white hover:bg-[#1149b8] text-xs font-semibold"
          >
            <Plus className="h-4 w-4" /> Add First Address
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {addresses.map((addr) => {
            const TagIcon =
              addr.label === 'Office'
                ? Building2
                : addr.label === 'Site'
                ? Factory
                : addr.label === 'Home'
                ? HomeIcon
                : MapPin;

            return (
              <div
                key={addr._id}
                className="rounded-2xl border border-[#e5ebf5] bg-white p-4 shadow-[0_2px_8px_rgba(15,35,80,0.04)] space-y-2.5 transition hover:border-[#ccd7ea]"
              >
                {/* Header: Label, Badges & Actions */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-[12.5px] font-bold text-[#0b1324] bg-[#f8fafc] border border-[#e2e8f0] px-2.5 py-0.5 rounded-lg">
                      <TagIcon className="h-3.5 w-3.5 text-[#1456d8]" /> {addr.label || 'Address'}
                    </span>
                    {addr.isDefault && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-0.5 text-[10.5px] font-semibold border border-emerald-200">
                        <Check className="h-2.5 w-2.5" /> Default
                      </span>
                    )}
                    {addr.zoneName && (
                      <span className="rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 text-[10.5px] font-semibold border border-blue-200">
                        {addr.zoneName}
                      </span>
                    )}
                  </div>

                  {/* Edit & Delete actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(addr)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-[#5d667a] hover:bg-[#f1f5f9] hover:text-[#1456d8] transition"
                      aria-label="Edit address"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteId(addr._id)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 transition"
                      aria-label="Delete address"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Address Body */}
                <div className="text-[12.5px] text-[#4a5568] leading-relaxed">
                  <p className="font-semibold text-[#0b1324]">{addr.line}</p>
                  {addr.landmark && (
                    <p className="text-[#64748b] text-[12px] mt-0.5">Landmark: {addr.landmark}</p>
                  )}
                  <p className="text-[#64748b] text-[12px]">
                    {[addr.city, addr.state, addr.pincode].filter(Boolean).join(', ')}
                  </p>
                </div>

                {/* Footer: GPS badge & Make Default */}
                <div className="flex items-center justify-between border-t border-[#f0f4fa] pt-2.5 text-[11.5px]">
                  <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    <MapPin className="h-3 w-3" /> GPS Pin Verified
                  </span>

                  {!addr.isDefault && (
                    <button
                      type="button"
                      onClick={() => handleSetDefault(addr._id)}
                      className="font-semibold text-[#1456d8] hover:underline"
                    >
                      Set as Default
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Delete Service Address</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this address? You can save up to 3 addresses.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 rounded-xl"
              onClick={() => setDeleteId(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={deleting}
              className="flex-1 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold"
              onClick={handleDelete}
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

