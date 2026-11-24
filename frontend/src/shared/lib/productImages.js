/**
 * Helper to resolve product thumbnail image URL with fallback mapping for known categories.
 */
export function resolveProductImage(p) {
  if (p?.images?.length && p.images[0]) {
    // If the path was an svg or local reference, use it
    const img = p.images[0];
    if (img.startsWith('http') || img.startsWith('/') || img.startsWith('data:')) {
      return img;
    }
  }

  const text = `${p?.brand || ''} ${p?.model || ''} ${p?.category || ''}`.toLowerCase();

  if (text.includes('battery') || text.includes(' ah') || text.includes('tubular')) {
    return '/images/products/battery.svg';
  }
  if (text.includes('generator') || text.includes('dg set') || text.includes('dg-set') || text.includes('dg9') || text.includes('ss-125')) {
    return '/images/products/dg-set.png';
  }
  if (text.includes('ac') || text.includes('air conditioner') || text.includes('voltas') || text.includes('split')) {
    return '/images/products/air-conditioner.png';
  }
  if (text.includes('inverter') || text.includes('zelio') || text.includes('ups') || text.includes('luminous')) {
    return '/images/products/inverter.png';
  }
  if (text.includes('pump') || text.includes('kirloskar') || text.includes('motor') || text.includes('monoblock')) {
    return '/images/products/water-pump.png';
  }

  return '/images/products/dg-set.png';
}

export const WARRANTY_CONFIG = {
  'In Warranty': {
    label: 'Under Warranty',
    pill: 'bg-[#e8f7ee] text-[#137a43] border border-[#c1e7ce]',
    dot: 'bg-[#1f9d55]',
  },
  'Expiring Soon': {
    label: 'Expiring Soon',
    pill: 'bg-[#fff8eb] text-[#b45309] border border-[#fde68a]',
    dot: 'bg-[#d97706]',
  },
  Expired: {
    label: 'Warranty Expired',
    pill: 'bg-[#fef2f2] text-[#b91c1c] border border-[#fecaca]',
    dot: 'bg-[#dc2626]',
  },
  Unknown: {
    label: 'Warranty Unknown',
    pill: 'bg-slate-50 text-slate-600 border border-slate-200',
    dot: 'bg-slate-400',
  },
};

