module.exports = {
  ROLES: ['admin', 'oem', 'vendor_owner', 'engineer', 'customer'],
  COMPANY_TYPES: ['oem', 'vendor'],
  JOB_TYPES: ['pm', 'breakdown', 'installation', 'other'],
  WARRANTY: ['warranty', 'non_warranty'],
  SR_STATUS: ['created', 'verified', 'assigned', 'accepted', 'in_progress', 'completed', 'under_review', 'approved', 'rejected', 'closed'],
  // dispatch priority: 1 same-company local, 2 same-city independent, 3 nearby partner, 4 backup/emergency
  DISPATCH_PRIORITY: [1, 2, 3, 4],
  MIN_APPROVED_CALLS_FOR_RECHARGE: 5,
  RECHARGE_DAYS: 28,
};
