export const BRAND = { name: 'Servoshakti', short: 'S' };

// panel key -> label, home route, the auth role allowed in, sidebar subtitle
export const panels = {
  oem: { label: 'OEM', homePath: '/oem', role: 'oem', brand: 'OEM Panel' },
  vendor: { label: 'Service Company', homePath: '/vendor', role: 'vendor_owner', brand: 'Service Company' },
  admin: { label: 'Admin', homePath: '/admin', role: 'admin', brand: 'Control Tower' },
};

const link = (label, icon, path) => ({ type: 'link', label, icon, path });
const section = (label, items) => ({ type: 'section', label, items });

export const sidebarMenus = {
  oem: [
    link('Dashboard', 'LayoutDashboard', '/oem'),
    section('Catalog', [
      link('Products', 'Package', '/oem/products'),
      link('Warranty', 'ShieldCheck', '/oem/warranty'),
    ]),
    section('Service', [
      link('Service Requests', 'Headset', '/oem/service-requests'),
      link('SLA / TAT', 'Zap', '/oem/sla-tat'),
    ]),
    section('Network', [
      link('Vendors', 'Building2', '/oem/vendors'),
      link('Rate Cards', 'DollarSign', '/oem/rate-cards'),
    ]),
    section('Insights', [link('Reports', 'BarChart3', '/oem/reports')]),
  ],
  vendor: [
    link('Dashboard', 'LayoutDashboard', '/vendor'),
    section('Company', [
      link('Company Profile', 'Building2', '/vendor/profile'),
      link('Engineers', 'UserCog', '/vendor/engineers'),
    ]),
    section('Calls', [
      link('Local Calls', 'Headset', '/vendor/local-calls'),
      link('Outside Requests', 'Route', '/vendor/outside-requests'),
      link('Tracking', 'MapPin', '/vendor/tracking'),
    ]),
    section('Finance', [
      link('Earnings', 'Wallet', '/vendor/earnings'),
      link('Disputes', 'AlertTriangle', '/vendor/disputes'),
    ]),
    section('Insights', [link('Reports', 'BarChart3', '/vendor/reports')]),
  ],
  admin: [
    link('Dashboard', 'LayoutDashboard', '/admin'),
    section('Customers', [link('All Customers', 'Users', '/admin/customers')]),
    section('OEMs', [
      link('All OEMs', 'Factory', '/admin/oems'),
      link('OEM Approvals', 'ShieldCheck', '/admin/oems/approvals'),
    ]),
    section('Service Companies', [
      link('All Service Companies', 'Building2', '/admin/vendors'),
      link('Service Company Approvals', 'ShieldCheck', '/admin/vendors/approvals'),
    ]),
    section('Engineers', [
      link('All Engineers', 'UserCog', '/admin/engineers'),
      link('Engineer Approvals', 'ShieldCheck', '/admin/engineers/approvals'),
    ]),
    section('Operations', [
      link('Service Requests', 'Headset', '/admin/service-requests'),
      link('Dispatch Log', 'Route', '/admin/dispatch'),
      link('Quality', 'Star', '/admin/quality'),
      link('Disputes', 'AlertTriangle', '/admin/disputes'),
    ]),
    section('Finance', [
      link('Rate Cards', 'DollarSign', '/admin/rate-cards'),
      link('Payouts', 'CreditCard', '/admin/payouts'),
      link('Settlements', 'Receipt', '/admin/settlements'),
      link('Incentives', 'Zap', '/admin/incentives'),
    ]),
    section('Insights', [link('MIS Reports', 'BarChart3', '/admin/mis')]),
    section('System', [
      link('Business Setup', 'Briefcase', '/admin/business-setup'),
      link('Settings', 'Settings', '/admin/settings'),
      link('Developer Settings', 'Code', '/admin/developer'),
    ]),
  ],
};
