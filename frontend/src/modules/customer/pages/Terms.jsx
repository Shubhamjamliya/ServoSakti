import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Clock, FileCheck2, FileText, MapPin, ShieldAlert, ShieldCheck } from 'lucide-react';

export default function Terms() {
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
          <h1 className="text-[20px] font-bold tracking-tight text-[#0b1324]">Terms & Conditions</h1>
          <p className="text-[12px] text-[#5d667a]">Aftenza FieldForce Service Network Policies</p>
        </div>
      </div>

      <div className="space-y-3 text-[13px] text-[#4a5568]">
        {/* Section 1 */}
        <div className="rounded-2xl border border-[#e5ebf5] bg-white p-4 shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-[#0b1324] font-bold text-[14.5px]">
            <Clock className="h-4 w-4 text-[#1456d8]" />
            <h3>1. Service Level Agreements (SLA & TAT)</h3>
          </div>
          <p className="leading-relaxed text-[#5d667a]">
            Our partner network operates with standard SLA response and turnaround windows based on the urgency of the breakdown:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-[#475467] text-[12.5px]">
            <li><strong>Urgent Priority:</strong> Response within 8 hours.</li>
            <li><strong>High Priority:</strong> Response within 24 hours.</li>
            <li><strong>Medium Priority:</strong> Response within 48 hours.</li>
            <li><strong>Low Priority / Routine Service:</strong> Response within 72 hours.</li>
          </ul>
        </div>

        {/* Section 2 */}
        <div className="rounded-2xl border border-[#e5ebf5] bg-white p-4 shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-[#0b1324] font-bold text-[14.5px]">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <h3>2. Warranty Verification & Genuine Parts</h3>
          </div>
          <p className="leading-relaxed text-[#5d667a]">
            Warranty coverage is validated against the registered product passport, equipment serial number, and verified purchase invoice.
          </p>
          <p className="leading-relaxed text-[#5d667a]">
            All replacement spares installed by certified field engineers are 100% genuine OEM-approved parts with direct manufacturer backing.
          </p>
        </div>

        {/* Section 3 */}
        <div className="rounded-2xl border border-[#e5ebf5] bg-white p-4 shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-[#0b1324] font-bold text-[14.5px]">
            <MapPin className="h-4 w-4 text-purple-600" />
            <h3>3. Service Zones & Site Access</h3>
          </div>
          <p className="leading-relaxed text-[#5d667a]">
            Field engineer visits are scheduled to verified site locations picked on Google Maps. Customers must provide reasonable and safe site access for engineers during normal operational hours.
          </p>
        </div>

        {/* Section 4 */}
        <div className="rounded-2xl border border-[#e5ebf5] bg-white p-4 shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-[#0b1324] font-bold text-[14.5px]">
            <FileCheck2 className="h-4 w-4 text-blue-600" />
            <h3>4. Service Sign-off & Closure OTP</h3>
          </div>
          <p className="leading-relaxed text-[#5d667a]">
            Job completion is certified via a secure 4-digit OTP provided by the customer at the site. Providing the OTP verifies that equipment testing and maintenance have met satisfactory standards.
          </p>
        </div>

        {/* Section 5 */}
        <div className="rounded-2xl border border-[#e5ebf5] bg-white p-4 shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-[#0b1324] font-bold text-[14.5px]">
            <ShieldAlert className="h-4 w-4 text-amber-600" />
            <h3>5. Warranty Exclusions</h3>
          </div>
          <p className="leading-relaxed text-[#5d667a]">
            Warranty does not cover damages caused by external electrical surges, improper installation by uncertified technicians, water logging, physical impact, or unapproved modifications.
          </p>
        </div>
      </div>
    </div>
  );
}
