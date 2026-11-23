const booking = require('../services/booking.service');

/**
 * Every minute: release prepaid bookings that were never paid, and expire revised quotes the customer did not answer
 * (the engineer then does only the booked work at the booked price).
 */
module.exports = async function billing() {
  const released = await booking.expireUnpaidBookings();
  const expired = await booking.expireQuotes();
  return { released, expired };
};
