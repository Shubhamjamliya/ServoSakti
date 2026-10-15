const cron = require('node-cron');

module.exports = function registerJobs(io) {
  // Auto-close every engineer day at 11:59 PM IST (no manual End Day)
  cron.schedule('59 23 * * *', () => require('./closeEngineerDays')(io), { timezone: 'Asia/Kolkata' });
  // Dispatch offer timeouts -> move to next candidate
  cron.schedule('* * * * *', () => require('./dispatchTimeouts')(io));
  // SLA / TAT risk alerts
  cron.schedule('*/5 * * * *', () => require('./slaAlerts')(io));
};
