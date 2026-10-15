const cron = require('node-cron');
const closeEngineerDays = require('./closeEngineerDays');
const dispatchTimeouts = require('./dispatchTimeouts');
const slaAlerts = require('./slaAlerts');
const complaintFollowUps = require('./complaintFollowUps');

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
  safe('closeDays', () => closeEngineerDays({ closeToday: false }))(); // sweep any day left open by downtime
};
