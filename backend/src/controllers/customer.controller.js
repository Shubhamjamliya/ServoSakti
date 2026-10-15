const Customer = require('../models/Customer');
const ServiceRequest = require('../models/ServiceRequest');
const { asyncHandler, paginate } = require('../utils/helpers');

exports.list = asyncHandler(async (req, res) => {
  const data = await paginate(Customer, {}, req, { search: ['name', 'phone'] });
  const counts = await ServiceRequest.aggregate([{ $match: { customerId: { $in: data.items.map((c) => c._id) } } }, { $group: { _id: '$customerId', n: { $sum: 1 } } }]);
  const map = new Map(counts.map((c) => [String(c._id), c.n]));
  data.items = data.items.map((c) => ({ ...c, requests: map.get(String(c._id)) || 0, addressCount: c.addresses?.length || 0 }));
  res.json(data);
});

exports.me = asyncHandler(async (req, res) => res.json(req.customer));

exports.updateMe = asyncHandler(async (req, res) => {
  const patch = {};
  if (req.body.name) patch.name = req.body.name;
  if (Array.isArray(req.body.addresses)) patch.addresses = req.body.addresses;
  res.json(await Customer.findByIdAndUpdate(req.customer._id, patch, { new: true }));
});
