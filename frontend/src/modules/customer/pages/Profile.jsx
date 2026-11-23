import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  Camera,
  ChevronRight,
  ClipboardList,
  Edit2,
  Eye,
  FileText,
  HelpCircle,
  Loader2,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Package,
  Phone,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Wrench,
} from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { api, uploadFiles } from '@/shared/lib/api';
import { useApi } from '@/shared/lib/useApi';
import { loginPath } from '@/shared/constants/authRoles';
import { useAuth } from '@/shared/context/AuthContext';
import { useToast } from '@/shared/context/ToastContext';
import { cn } from '@/shared/lib/utils';

export default function Profile() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const toast = useToast();

  const { data: me, reload: reloadMe, loading: loadingMe } = useApi('/customers/me');
  const { data: passports } = useApi('/products/passports?limit=100');
  const { data: serviceRequests } = useApi('/service-requests?limit=100');
  const { data: notif } = useApi('/notifications');

  // Edit Personal Profile modal
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Photo actions & viewer state
  const [photoActionOpen, setPhotoActionOpen] = useState(false);
  const [viewPhotoOpen, setViewPhotoOpen] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  // Logout confirm dialog
  const [logoutOpen, setLogoutOpen] = useState(false);

  // Delete account dialog
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    if (me) {
      setNameInput(me.name || '');
      setEmailInput(me.email || '');
    }
  }, [me]);

  const savedAddresses = me?.addresses || [];
  const maxReached = savedAddresses.length >= 3;

  // Active / History calculations
  const totalProducts = passports?.items?.length || 0;
  const requests = serviceRequests?.items || [];
  const activeRequests = requests.filter((r) => ['created', 'assigned', 'in_progress', 'under_review'].includes(r.status));
  const completedRequests = requests.filter((r) => ['closed', 'approved'].includes(r.status));

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!nameInput.trim()) {
      return toast.error('Name cannot be empty');
    }
    setSavingProfile(true);
    try {
      await api('/customers/me', {
        method: 'PATCH',
        body: { name: nameInput.trim(), email: emailInput.trim() },
      });
      toast.success('Profile updated successfully');
      setEditProfileOpen(false);
      reloadMe();
    } catch (err) {
      toast.error(err.message || 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePhotoSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select a valid image file (JPG, PNG, WebP)');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image size must be less than 10MB');
      return;
    }

    setUploadingPhoto(true);
    try {
      const urls = await uploadFiles([file]);
      if (urls && urls[0]) {
        await api('/customers/me', {
          method: 'PATCH',
          body: { avatar: urls[0] },
        });
        toast.success('Profile photo updated successfully');
        setPhotoActionOpen(false);
        reloadMe();
      }
    } catch (err) {
      toast.error(err.message || 'Failed to upload photo');
    } finally {
      setUploadingPhoto(false);
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (galleryInputRef.current) galleryInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = async () => {
    setUploadingPhoto(true);
    try {
      await api('/customers/me', {
        method: 'PATCH',
        body: { avatar: '' },
      });
      toast.success('Profile photo removed');
      setPhotoActionOpen(false);
      setViewPhotoOpen(false);
      reloadMe();
    } catch (err) {
      toast.error(err.message || 'Failed to remove photo');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleLogout = () => {
    const to = loginPath(user?.role);
    logout();
    nav(to);
  };

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      await api('/customers/me', { method: 'DELETE' });
      toast.success('Your account has been deleted permanently');
      logout();
      nav(loginPath(user?.role || 'customer'));
    } catch (err) {
      toast.error(err.message || 'Failed to delete account');
    } finally {
      setDeletingAccount(false);
      setDeleteAccountOpen(false);
    }
  };

  if (loadingMe && !me) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-24 rounded-2xl bg-[#e8eef8]" />
        <div className="h-20 rounded-2xl bg-[#e8eef8]" />
        <div className="h-44 rounded-2xl bg-[#e8eef8]" />
      </div>
    );
  }

  const initials = (me?.name || 'Customer')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join('');

  return (
    <div className="w-full max-w-full overflow-hidden space-y-4">
      {/* Hidden file inputs for Camera and Gallery */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={handlePhotoSelected}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/heic"
        className="hidden"
        onChange={handlePhotoSelected}
      />

      {/* 1. Profile User Card */}
      <div className="rounded-2xl border border-[#e5ebf5] bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            {/* Avatar with Camera badge */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setPhotoActionOpen(true)}
                className="group relative flex h-15 w-15 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-tr from-[#1456d8] to-[#3b82f6] text-[18px] font-extrabold text-white shadow-md border-2 border-white ring-2 ring-[#e5ebf5] transition hover:opacity-95 active:scale-95 focus:outline-none"
                aria-label="Change profile photo"
              >
                {me?.avatar ? (
                  <img
                    src={me.avatar}
                    alt={me?.name || 'Customer'}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span>{initials}</span>
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition">
                  <Camera className="h-5 w-5 text-white" />
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPhotoActionOpen(true)}
                className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#1456d8] text-white shadow-md ring-2 ring-white hover:bg-[#1149b8] active:scale-90 transition"
                aria-label="Upload photo"
              >
                <Camera className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Name & Contact */}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-[17px] font-bold text-[#0b1324]">{me?.name || 'Customer'}</h2>
                <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.2 text-[10px] font-semibold text-emerald-700">
                  <ShieldCheck className="h-3 w-3" /> Verified
                </span>
              </div>
              <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] font-medium text-[#5d667a]">
                <Phone className="h-3 w-3 text-[#8a94a6]" /> +91 {me?.phone}
              </p>
              {me?.email ? (
                <p className="flex items-center gap-1.5 text-[12px] text-[#5d667a] truncate">
                  <Mail className="h-3 w-3 text-[#8a94a6]" /> {me.email}
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditProfileOpen(true)}
                  className="mt-0.5 text-[11.5px] text-[#1456d8] font-semibold hover:underline"
                >
                  + Add Email Address
                </button>
              )}
            </div>
          </div>

          {/* Edit profile button */}
          <button
            type="button"
            onClick={() => setEditProfileOpen(true)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#e2e8f0] text-[#5d667a] hover:bg-[#f8fafc] hover:text-[#1456d8] transition"
            aria-label="Edit personal details"
          >
            <Edit2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Quick Activity & Metrics Bar */}
      <div className="grid grid-cols-3 gap-2">
        <Link
          to="/customer/product-passport"
          className="flex flex-col items-center justify-center rounded-2xl border border-[#e5ebf5] bg-white p-2.5 text-center shadow-sm transition hover:border-[#1456d8]/30 active:scale-98"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-[#1456d8]">
            <Package className="h-4 w-4" />
          </div>
          <span className="mt-1.5 text-[16px] font-bold text-[#0b1324] leading-tight">{totalProducts}</span>
          <span className="text-[10.5px] font-medium text-[#5d667a] leading-none mt-0.5">My Products</span>
        </Link>

        <Link
          to="/customer/service-requests"
          className="flex flex-col items-center justify-center rounded-2xl border border-[#e5ebf5] bg-white p-2.5 text-center shadow-sm transition hover:border-[#1456d8]/30 active:scale-98"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
            <Wrench className="h-4 w-4" />
          </div>
          <span className="mt-1.5 text-[16px] font-bold text-[#0b1324] leading-tight">{activeRequests.length}</span>
          <span className="text-[10.5px] font-medium text-[#5d667a] leading-none mt-0.5">Active Requests</span>
        </Link>

        <Link
          to="/customer/history"
          className="flex flex-col items-center justify-center rounded-2xl border border-[#e5ebf5] bg-white p-2.5 text-center shadow-sm transition hover:border-[#1456d8]/30 active:scale-98"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <ClipboardList className="h-4 w-4" />
          </div>
          <span className="mt-1.5 text-[16px] font-bold text-[#0b1324] leading-tight">{completedRequests.length}</span>
          <span className="text-[10.5px] font-medium text-[#5d667a] leading-none mt-0.5">Completed</span>
        </Link>
      </div>

      {/* 3. Primary Sections: Saved Addresses & Activities */}
      <div className="rounded-2xl border border-[#e5ebf5] bg-white divide-y divide-[#f0f4fa] shadow-sm overflow-hidden text-[13px]">
        {/* Saved Addresses (Opens dedicated /customer/addresses page) */}
        <Link
          to="/customer/addresses"
          className="flex items-center justify-between p-3.5 hover:bg-[#fafbfd] transition"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-[#1456d8]">
              <MapPin className="h-4 w-4" />
            </div>
            <div>
              <p className="font-semibold text-[#0b1324]">Saved Service Addresses</p>
              <p className="text-[11.5px] text-[#5d667a]">Manage up to 3 verified map locations</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10.5px] font-semibold',
                maxReached ? 'bg-amber-100 text-amber-800' : 'bg-[#eef2f8] text-[#5d667a]'
              )}
            >
              {savedAddresses.length} / 3
            </span>
            <ChevronRight className="h-4 w-4 text-[#8a94a6]" />
          </div>
        </Link>

        {/* AI Complaint Assistant (SOP Section 07) */}
        <Link
          to="/customer/complaints"
          className="flex items-center justify-between p-3.5 hover:bg-[#fafbfd] transition"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-700">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="font-semibold text-[#0b1324]">AI Complaint Assistant</p>
              <p className="text-[11.5px] text-[#5d667a]">Voice & text brand complaint registration</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-[#8a94a6]" />
        </Link>

        {/* Notifications & Updates */}
        <Link
          to="/customer/notifications"
          className="flex items-center justify-between p-3.5 hover:bg-[#fafbfd] transition"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <Bell className="h-4 w-4" />
            </div>
            <div>
              <p className="font-semibold text-[#0b1324]">Notifications & Updates</p>
              <p className="text-[11.5px] text-[#5d667a]">Service visit alerts & warranty reminders</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {notif?.unread > 0 && (
              <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-[10.5px] font-semibold">
                {notif.unread} new
              </span>
            )}
            <ChevronRight className="h-4 w-4 text-[#8a94a6]" />
          </div>
        </Link>
      </div>

      {/* 4. Support, Terms & Policies (Dedicated Pages) */}
      <div className="rounded-2xl border border-[#e5ebf5] bg-white divide-y divide-[#f0f4fa] shadow-sm overflow-hidden text-[13px]">
        {/* Help & Support (Dedicated Page: /customer/support) */}
        <Link
          to="/customer/support"
          className="flex items-center justify-between p-3.5 hover:bg-[#fafbfd] transition"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-[#475467]">
              <HelpCircle className="h-4 w-4" />
            </div>
            <div>
              <p className="font-semibold text-[#0b1324]">Help & Customer Support</p>
              <p className="text-[11.5px] text-[#5d667a]">FAQs, contact desk & service assistance</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-[#8a94a6]" />
        </Link>

        {/* Terms of Service (Dedicated Page: /customer/terms) */}
        <Link
          to="/customer/terms"
          className="flex items-center justify-between p-3.5 hover:bg-[#fafbfd] transition"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-[#475467]">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <p className="font-semibold text-[#0b1324]">Terms & Warranty Conditions</p>
              <p className="text-[11.5px] text-[#5d667a]">SLA windows, warranty eligibility & policies</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-[#8a94a6]" />
        </Link>

        {/* Privacy Policy (Dedicated Page: /customer/privacy) */}
        <Link
          to="/customer/privacy"
          className="flex items-center justify-between p-3.5 hover:bg-[#fafbfd] transition"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-[#475467]">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <p className="font-semibold text-[#0b1324]">Privacy Policy</p>
              <p className="text-[11.5px] text-[#5d667a]">Data protection & location privacy</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-[#8a94a6]" />
        </Link>
      </div>

      {/* 5. App Version, Log Out & Delete Account */}
      <div className="pt-2 flex flex-col items-center">
        <div className="flex items-center justify-center gap-2.5 w-full max-w-[340px]">
          {/* Log Out Button (Normal styling, not red, compact) */}
          <Button
            variant="outline"
            className="flex-1 rounded-xl border-[#d8e0ed] bg-white text-[#344054] hover:bg-[#f8fafc] hover:text-[#0b1324] font-semibold text-xs gap-1.5 h-10 shadow-xs transition"
            onClick={() => setLogoutOpen(true)}
          >
            <LogOut className="h-4 w-4 text-[#5d667a]" /> Log Out
          </Button>

          {/* Delete Account Button (Red styling, compact) */}
          <Button
            variant="outline"
            className="flex-1 rounded-xl border-red-200 bg-red-50/60 text-red-600 hover:bg-red-100 hover:text-red-700 font-semibold text-xs gap-1.5 h-10 transition"
            onClick={() => setDeleteAccountOpen(true)}
          >
            <Trash2 className="h-4 w-4 text-red-600" /> Delete Account
          </Button>
        </div>

        <p className="text-center text-[11px] text-[#8a94a6] pt-3">
          Aftenza FieldForce Network • Version 1.0.0
        </p>
      </div>

      {/* Modal: Edit Personal Details */}
      <Dialog open={editProfileOpen} onOpenChange={setEditProfileOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Personal Details</DialogTitle>
            <DialogDescription>Update your display name and email address.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveProfile} className="space-y-3.5 pt-1">
            <div>
              <label className="text-xs font-semibold text-[#475467] block mb-1">Full Name *</label>
              <Input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Your full name"
                required
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-[#475467] block mb-1">Registered Phone Number</label>
              <div className="flex items-center gap-2 rounded-xl border border-[#e2e8f0] bg-neutral-100 px-3 py-2 text-sm text-[#64748b]">
                <Lock className="h-3.5 w-3.5 text-[#94a3b8]" />
                <span>+91 {me?.phone}</span>
                <span className="ml-auto text-[10.5px] font-semibold text-emerald-700">Verified</span>
              </div>
              <p className="text-[10.5px] text-[#8a94a6] mt-1">
                Your registered mobile number is your login ID and cannot be changed here.
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold text-[#475467] block mb-1">Email Address</label>
              <Input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="name@example.com"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 rounded-xl"
                onClick={() => setEditProfileOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={savingProfile}
                className="flex-1 rounded-xl bg-[#1456d8] hover:bg-[#1149b8] text-white font-semibold"
              >
                {savingProfile ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Photo Actions (Choose Camera / Gallery / View / Remove) */}
      <Dialog open={photoActionOpen} onOpenChange={(open) => !uploadingPhoto && setPhotoActionOpen(open)}>
        <DialogContent className="max-w-sm rounded-2xl p-5">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-[#0b1324]">Profile Photo</DialogTitle>
            <DialogDescription className="text-xs text-[#5d667a]">
              Choose how you would like to update your profile photo
            </DialogDescription>
          </DialogHeader>

          {uploadingPhoto ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-[#1456d8]" />
              <p className="text-sm font-medium text-[#475467]">Updating profile photo...</p>
            </div>
          ) : (
            <div className="space-y-2 pt-2">
              {/* Option 1: Camera */}
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="w-full flex items-center gap-3.5 p-3 rounded-xl border border-[#e5ebf5] bg-white hover:bg-[#f8fafc] text-left transition active:scale-98"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1456d8]">
                  <Camera className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-[#0b1324]">Take Photo</p>
                  <p className="text-[11.5px] text-[#5d667a]">Use your device camera</p>
                </div>
              </button>

              {/* Option 2: Gallery Upload */}
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="w-full flex items-center gap-3.5 p-3 rounded-xl border border-[#e5ebf5] bg-white hover:bg-[#f8fafc] text-left transition active:scale-98"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <Upload className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-[#0b1324]">Upload from Gallery</p>
                  <p className="text-[11.5px] text-[#5d667a]">Select an image file from storage</p>
                </div>
              </button>

              {/* Option 3: View Full Photo (if avatar exists) */}
              {me?.avatar && (
                <button
                  type="button"
                  onClick={() => {
                    setPhotoActionOpen(false);
                    setViewPhotoOpen(true);
                  }}
                  className="w-full flex items-center gap-3.5 p-3 rounded-xl border border-[#e5ebf5] bg-white hover:bg-[#f8fafc] text-left transition active:scale-98"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                    <Eye className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold text-[#0b1324]">View Full Photo</p>
                    <p className="text-[11.5px] text-[#5d667a]">Preview current profile photo</p>
                  </div>
                </button>
              )}

              {/* Option 4: Remove Photo (if avatar exists) */}
              {me?.avatar && (
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="w-full flex items-center gap-3.5 p-3 rounded-xl border border-red-100 bg-red-50/40 hover:bg-red-50 text-left transition active:scale-98"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600">
                    <Trash2 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold text-red-600">Remove Photo</p>
                    <p className="text-[11.5px] text-red-400">Revert to default initials</p>
                  </div>
                </button>
              )}

              <Button
                type="button"
                variant="outline"
                className="w-full rounded-xl mt-2 text-[#475467]"
                onClick={() => setPhotoActionOpen(false)}
              >
                Cancel
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal: View Full Photo Lightbox */}
      <Dialog open={viewPhotoOpen} onOpenChange={setViewPhotoOpen}>
        <DialogContent className="max-w-sm rounded-2xl p-4">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-[#0b1324]">{me?.name || 'Customer'}</DialogTitle>
            <DialogDescription className="text-xs text-[#5d667a]">Profile Photo Preview</DialogDescription>
          </DialogHeader>

          <div className="relative my-2 aspect-square w-full overflow-hidden rounded-2xl bg-neutral-100 border border-[#e5ebf5] flex items-center justify-center">
            {me?.avatar ? (
              <img
                src={me.avatar}
                alt={me?.name || 'Customer'}
                className="h-full w-full object-cover"
              />
            ) : null}
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 rounded-xl"
              onClick={() => {
                setViewPhotoOpen(false);
                setPhotoActionOpen(true);
              }}
            >
              Change Photo
            </Button>
            <Button
              type="button"
              className="flex-1 rounded-xl bg-[#1456d8] hover:bg-[#1149b8] text-white"
              onClick={() => setViewPhotoOpen(false)}
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Confirm Logout */}
      <Dialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Log Out</DialogTitle>
            <DialogDescription>Are you sure you want to log out of your Aftenza account?</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 rounded-xl"
              onClick={() => setLogoutOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="flex-1 rounded-xl bg-[#1456d8] hover:bg-[#1149b8] text-white font-semibold"
              onClick={handleLogout}
            >
              Log Out
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Confirm Delete Account */}
      <Dialog open={deleteAccountOpen} onOpenChange={(open) => !deletingAccount && setDeleteAccountOpen(open)}>
        <DialogContent className="max-w-sm rounded-2xl p-5">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-red-600 mb-1">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <DialogHeader className="text-center">
            <DialogTitle className="text-center text-lg font-bold text-red-600">Delete Account Permanently?</DialogTitle>
            <DialogDescription className="text-center text-xs text-[#5d667a]">
              This action is irreversible. All your data will be permanently wiped from Aftenza.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border border-red-200 bg-red-50/60 p-3 text-xs text-red-800 space-y-1.5 my-2">
            <p className="font-semibold text-red-900">What will be deleted:</p>
            <ul className="list-disc pl-4 space-y-0.5 text-[11.5px] text-red-700">
              <li>All registered products & digital passports</li>
              <li>Warranty coverage & service request histories</li>
              <li>Saved service addresses & verified map pins</li>
              <li>Customer profile and notification preferences</li>
            </ul>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={deletingAccount}
              className="flex-1 rounded-xl"
              onClick={() => setDeleteAccountOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={deletingAccount}
              className="flex-1 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold gap-1.5"
              onClick={handleDeleteAccount}
            >
              {deletingAccount ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Deleting...
                </>
              ) : (
                'Delete My Account'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
