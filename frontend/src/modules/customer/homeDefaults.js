// Defaults for the customer home screen. Admin → Customer App overrides any of these.
export const DEFAULT_SUBTITLE = 'Manage your products, raise service requests and track them in real time.';

export const DEFAULT_BANNERS = [
  { image: 'https://res.cloudinary.com/l9shqktb/image/upload/v1793634278/aftenza/banners/banner_service.jpg' },
  { image: 'https://res.cloudinary.com/l9shqktb/image/upload/v1793634280/aftenza/banners/banner_parts.jpg' },
  { image: 'https://res.cloudinary.com/l9shqktb/image/upload/v1793634283/aftenza/banners/banner_tracking.jpg' },
];

export const QUICK_ACTIONS = [
  { key: 'request', label: 'Raise a Service Request', image: '/images/customer/action-request.svg', to: '/customer/service-requests', tile: '#eef4ff' },
  { key: 'product', label: 'Register Your Product', image: '/images/customer/action-product.svg', to: '/customer/product-passport', tile: '#ebf8f2' },
  { key: 'warranty', label: 'Check Warranty', image: '/images/customer/action-warranty.svg', to: '/customer/product-passport', tile: '#fff3ea' },
  { key: 'history', label: 'My Service History', image: '/images/customer/action-history.svg', to: '/customer/history', tile: '#f2eefd' },
];

/** Defaults merged with what the admin saved (blank fields fall back to the default). */
export function resolveHome(saved) {
  const banners = (saved?.banners?.length ? saved.banners : DEFAULT_BANNERS)
    .map((b, i) => ({ ...b, image: b.image || DEFAULT_BANNERS[i % DEFAULT_BANNERS.length].image }));
  const quick = QUICK_ACTIONS.map((q) => {
    const s = (saved?.quickActions || []).find((x) => x.key === q.key) || {};
    return { ...q, label: s.label || q.label, image: s.image || q.image };
  });
  return { subtitle: saved?.subtitle || DEFAULT_SUBTITLE, banners, quick };
}
