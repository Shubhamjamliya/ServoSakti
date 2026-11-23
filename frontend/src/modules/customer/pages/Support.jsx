import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Headset,
  HelpCircle,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/utils';

const FAQS = [
  {
    q: 'How do I raise a service request for my equipment?',
    a: 'You can tap "+ New" in the bottom navigation bar or click "Book Service" directly on any registered equipment in "My Products". Select the breakdown issue, choose your saved address or current GPS, and submit.',
  },
  {
    q: 'How many service addresses can I save?',
    a: 'You can save up to 3 verified service locations (e.g. Home, Office, Site/Plant). Each address is verified on Google Maps with latitude/longitude coordinates to ensure technicians arrive directly at your equipment.',
  },
  {
    q: 'What is the AI Complaint Assistant?',
    a: 'The AI Assistant (SOP Section 07) lets you describe equipment issues using text or voice. It transcribes the issue, registers an official complaint with the OEM customer care, and tracks turnaround time (TAT).',
  },
  {
    q: 'How do I track my engineer in real time?',
    a: 'Once a service request is assigned and the engineer starts their visit, navigate to "Tracking" or click on the request in "Active Requests" to see live GPS status and estimated arrival.',
  },
  {
    q: 'What is the service closure verification OTP?',
    a: 'At the end of a service visit, the engineer will ask for a 4-digit OTP generated on your app. Only provide this code once you are fully satisfied with the equipment inspection and repair.',
  },
  {
    q: 'What if my product warranty has expired?',
    a: 'You can still raise service requests for expired products! Certified partner engineers will be dispatched with OEM rate cards and transparent estimate approval before carrying out repairs.',
  },
];

export default function Support() {
  const [openFaq, setOpenFaq] = useState(0);
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
          <h1 className="text-[20px] font-bold tracking-tight text-[#0b1324]">Help & Support</h1>
          <p className="text-[12px] text-[#5d667a]">Frequently asked questions & customer care</p>
        </div>
      </div>

      {/* AI Assistant Highlight Card */}
      <div className="rounded-2xl bg-gradient-to-r from-[#1456d8] to-[#1e61ea] p-4 text-white shadow-[0_8px_20px_rgba(20,86,216,0.25)] space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
            <Sparkles className="h-4 w-4 text-white" />
          </span>
          <h3 className="text-[15px] font-bold leading-tight">AI Complaint Assistant</h3>
        </div>
        <p className="text-[12px] text-blue-100 leading-relaxed">
          Need help registering an official complaint with an OEM brand? Use voice or text intake to register your issue automatically.
        </p>
        <Link
          to="/customer/complaints"
          className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-[12px] font-bold text-[#1456d8] hover:bg-blue-50 transition"
        >
          Open AI Assistant <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Contact Channels */}
      <div className="rounded-2xl border border-[#e5ebf5] bg-white p-4 shadow-sm space-y-3">
        <h3 className="text-[14px] font-bold text-[#0b1324]">Direct Support Channels</h3>
        <div className="grid grid-cols-2 gap-2 text-[12px]">
          <div className="rounded-xl border border-[#e2e8f0] bg-[#fafbfd] p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-[#1456d8] font-bold">
              <Phone className="h-4 w-4" /> Phone Support
            </div>
            <p className="text-[#0b1324] font-semibold">+91 1800 200 4567</p>
            <p className="text-[11px] text-[#8a94a6]">Mon - Sat: 9 AM - 7 PM</p>
          </div>

          <div className="rounded-xl border border-[#e2e8f0] bg-[#fafbfd] p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-[#1456d8] font-bold">
              <Mail className="h-4 w-4" /> Email Support
            </div>
            <p className="text-[#0b1324] font-semibold truncate">support@aftenza.com</p>
            <p className="text-[11px] text-[#8a94a6]">Response within 24 hrs</p>
          </div>
        </div>
      </div>

      {/* FAQs Accordion */}
      <div className="rounded-2xl border border-[#e5ebf5] bg-white p-4 shadow-sm space-y-3">
        <h3 className="text-[14px] font-bold text-[#0b1324]">Frequently Asked Questions</h3>

        <div className="divide-y divide-[#f0f4fa]">
          {FAQS.map((faq, i) => {
            const isOpen = openFaq === i;
            return (
              <div key={i} className="py-2.5 first:pt-0 last:pb-0">
                <button
                  type="button"
                  onClick={() => setOpenFaq(isOpen ? -1 : i)}
                  className="flex w-full items-center justify-between text-left text-[12.5px] font-semibold text-[#0b1324] hover:text-[#1456d8] transition"
                >
                  <span className="pr-2">{faq.q}</span>
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4 text-[#1456d8] shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-[#8a94a6] shrink-0" />
                  )}
                </button>
                {isOpen && (
                  <p className="mt-1.5 text-[12px] leading-relaxed text-[#5d667a] pl-0.5">
                    {faq.a}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
