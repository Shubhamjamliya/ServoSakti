const cron = require('node-cron');
const closeEngineerDays = require('./closeEngineerDays');
const dispatchTimeouts = require('./dispatchTimeouts');
const slaAlerts = require('./slaAlerts');
const complaintFollowUps = require('./complaintFollowUps');
const warrantyReminders = require('./warrantyReminders');
const billing = require('./billing');
const { dailyPlanJob } = require('../services/plan.service');

const safe = (name, fn) => async () => {
  try { await fn(); } catch (e) { console.error(`[job:${name}]`, e.message); }
};

module.exports = function registerJobs() {
  // No manual "End Day": every open engineer day is closed at 23:59 IST.
  cron.schedule('59 23 * * *', safe('closeDays', () => closeEngineerDays()), { timezone: 'Asia/Kolkata' });
  // Offers not accepted within the window move to the next candidate.
  cron.schedule('* * * * *', safe('dispatchTimeouts', dispatchTimeouts));
  cron.schedule('*/5 * * * *', safe('slaAlerts', slaAlerts));
  cron.schedule('0 * * * *', safe('complaintFollowUps', complaintFollowUps));
  cron.schedule('0 9 * * *', safe('warrantyReminders', warrantyReminders), { timezone: 'Asia/Kolkata' });
  cron.schedule('* * * * *', safe('billing', billing)); // unpaid bookings + unanswered revised quotes
  cron.schedule('30 9 * * *', safe('plans', dailyPlanJob), { timezone: 'Asia/Kolkata' }); // AMC/CMC expiry, renewal and PM reminders
  safe('closeDays', () => closeEngineerDays({ closeToday: false }))(); // sweep any day left open by downtime
};
