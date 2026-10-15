const DayLog = require('../models/DayLog');
const { istDate } = require('../utils/helpers');

/**
 * Closes open engineer days. The 23:59 IST cron closes everything (closeToday = true);
 * the startup sweep only closes days left open from before today.
 */
module.exports = async function closeEngineerDays({ closeToday = true } = {}) {
  const filter = { closedAt: null, ...(closeToday ? {} : { date: { $lt: istDate() } }) };
  const res = await DayLog.updateMany(filter, { closedAt: new Date(), autoClosed: true });
  return res.modifiedCount;
};
