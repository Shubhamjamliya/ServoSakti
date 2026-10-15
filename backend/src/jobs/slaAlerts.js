const ServiceRequest = require('../models/ServiceRequest');
const { notifyAdmins, notifyCompany } = require('../services/realtime');

/** Flags calls past their TAT and warns once when a call has used 80% of its window. */
module.exports = async function slaAlerts() {
  const now = new Date();
  const open = await ServiceRequest.find({ status: { $nin: ['approved', 'closed', 'cancelled'] }, tatDueAt: { $ne: null }, slaAlertedAt: null });
  for (const sr of open) {
    const total = sr.tatDueAt - sr.createdAt;
    const used = (now - sr.createdAt) / total;
    if (now > sr.tatDueAt) {
      sr.slaBreached = true;
      sr.slaAlertedAt = now;
      await sr.save();
      await notifyAdmins('SLA breached', `${sr.srNumber} has passed its TAT`, 'sla');
      await notifyCompany(sr.oemId, 'SLA breached', `${sr.srNumber} has passed its TAT`, 'sla');
      await notifyCompany(sr.vendorId, 'SLA breached', `${sr.srNumber} has passed its TAT`, 'sla');
    } else if (used >= 0.8) {
      sr.slaAlertedAt = now;
      await sr.save();
      await notifyCompany(sr.oemId, 'SLA at risk', `${sr.srNumber} has used 80% of its TAT`, 'sla');
      await notifyCompany(sr.vendorId, 'SLA at risk', `${sr.srNumber} has used 80% of its TAT`, 'sla');
    }
  }
};
