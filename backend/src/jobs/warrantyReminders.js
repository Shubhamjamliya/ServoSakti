const ProductPassport = require('../models/ProductPassport');
const Customer = require('../models/Customer');
const Setting = require('../models/Setting');
const { notify } = require('../services/realtime');

/**
 * Daily: tells customers when a product's warranty is about to end (default 30, 7 and 1 days before; configurable in Settings).
 * `remindersSent` stores which thresholds were already sent so nobody is reminded twice for the same one.
 */
module.exports = async function warrantyReminders() {
  const { warrantyReminderDays } = await Setting.get();
  const steps = [...new Set(warrantyReminderDays || [])].filter((d) => d > 0);
  if (!steps.length) return 0;
  const now = Date.now();
  const passports = await ProductPassport.find({ warrantyEnd: { $gt: new Date(now), $lte: new Date(now + Math.max(...steps) * 86400000) } });
  let sent = 0;
  for (const p of passports) {
    const left = Math.ceil((p.warrantyEnd - now) / 86400000);
    const due = steps.filter((d) => left <= d && !p.remindersSent.includes(d));
    if (!due.length) continue;
    p.remindersSent.push(...due);
    await p.save();
    const customerId = p.customerId || (await Customer.findOne({ phone: p.customerPhone }).select('_id').lean())?._id;
    if (!customerId) continue;
    await notify([customerId], 'Warranty ending soon', `${p.brand} ${p.model || ''} (${p.serialNumber}) — warranty ends in ${left} day${left === 1 ? '' : 's'}`, 'warranty');
    sent += 1;
  }
  return sent;
};
