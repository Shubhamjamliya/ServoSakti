const DayLog = require('../models/DayLog');
const Engineer = require('../models/Engineer');
const { istDate } = require('../utils/helpers');

/**
 * Closes open engineer days. The 23:59 IST cron closes everything (closeToday = true);
 * the startup sweep only closes days left open from before today.
 */
module.exports = async function closeEngineerDays({ closeToday = true } = {}) {
  const filter = { closedAt: null, ...(closeToday ? {} : { date: { $lt: istDate() } }) };
  const closing = await DayLog.find(filter).select('engineerId').lean();
  const res = await DayLog.updateMany(filter, { closedAt: new Date(), autoClosed: true });
  // a closed day means off duty: engineers go online again (and start a new day) the next morning
  if (closing.length) await Engineer.updateMany({ _id: { $in: closing.map((d) => d.engineerId) } }, { available: false });
  return res.modifiedCount;
};
