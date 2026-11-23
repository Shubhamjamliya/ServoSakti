import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Database, Eye, Lock, MapPin, Shield, UserCheck } from 'lucide-react';

export default function Privacy() {
  const nav = useNavigate();

  const handleBack = () => {
    if (window.history.length > 1) nav(-1);
    else nav('/customer/login');
  };

  return (
    <div className="w-full max-w-full overflow-hidden space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-[#e2e8f0] pb-3">
        <button
          type="button"
          onClick={handleBack}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-[#e2e8f0] text-[#5d667a] hover:bg-[#f8fafc] transition"
          aria-label="Back"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-[20px] font-bold tracking-tight text-[#0b1324]">Privacy Policy</h1>
          <p className="text-[12px] text-[#5d667a]">How your data and location are safeguarded</p>
        </div>
      </div>

      <div className="space-y-3 text-[13px] text-[#4a5568]">
        {/* Section 1 */}
        <div className="rounded-2xl border border-[#e5ebf5] bg-white p-4 shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-[#0b1324] font-bold text-[14.5px]">
            <Database className="h-4 w-4 text-[#1456d8]" />
            <h3>1. Information We Collect</h3>
          </div>
          <p className="leading-relaxed text-[#5d667a]">
            We collect personal information necessary to deliver OEM warranty and field engineering services:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-[#475467] text-[12.5px]">
            <li><strong>Account Identity:</strong> Customer name and verified phone number.</li>
            <li><strong>Equipment Data:</strong> Brand, model, serial number, purchase date, and uploaded invoices.</li>
            <li><strong>Service Locations:</strong> Precise GPS coordinates and street addresses saved for equipment sites.</li>
          </ul>
        </div>

        {/* Section 2 */}
        <div className="rounded-2xl border border-[#e5ebf5] bg-white p-4 shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-[#0b1324] font-bold text-[14.5px]">
            <MapPin className="h-4 w-4 text-emerald-600" />
            <h3>2. How Location Data Is Used</h3>
          </div>
          <p className="leading-relaxed text-[#5d667a]">
            Your location data is only accessed when an active service request is created. It is shared solely with the certified field engineer dispatched to your site to ensure accurate, timely navigation.
          </p>
          <p className="leading-relaxed text-[#5d667a]">
            We do not track your device background location continuously or sell location data to third parties.
          </p>
        </div>

        {/* Section 3 */}
        <div className="rounded-2xl border border-[#e5ebf5] bg-white p-4 shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-[#0b1324] font-bold text-[14.5px]">
            <Lock className="h-4 w-4 text-purple-600" />
            <h3>3. Data Security & Encryption</h3>
          </div>
          <p className="leading-relaxed text-[#5d667a]">
            All communications, API endpoints, uploaded invoices, and customer tokens are protected with industry-standard TLS encryption, strict role-based access control, and audited database backups.
          </p>
        </div>

        {/* Section 4 */}
        <div className="rounded-2xl border border-[#e5ebf5] bg-white p-4 shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-[#0b1324] font-bold text-[14.5px]">
            <UserCheck className="h-4 w-4 text-amber-600" />
            <h3>4. Your Rights & Account Deletion</h3>
          </div>
          <p className="leading-relaxed text-[#5d667a]">
            You retain full ownership of your data. You may edit your profile details or permanently delete your account and associated product passports anytime from your Account Profile screen.
          </p>
        </div>
      </div>
    </div>
  );
}
