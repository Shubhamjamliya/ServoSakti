const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const { MODEL_BY_ROLE } = require('../models/accounts');

// Reads the service account from FIREBASE_SERVICE_ACCOUNT (single-line JSON). Push is skipped silently when it is not configured.
let app = null;
function getApp() {
  if (app) return app;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    app = getApps()[0] || initializeApp({ credential: cert(JSON.parse(raw)) });
  } catch (e) {
    console.error('Firebase init failed:', e.message);
    return null;
  }
  return app;
}

const isUnregistered = (error) => ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(error?.code);

// FCM multicast caps at 500 tokens per request.
const FCM_BATCH_SIZE = 500;

/** Sends to a flat token list in batches and returns the tokens FCM rejected as dead (uninstalled app, revoked permission). */
async function sendToTokens(tokens, { title, body, data }) {
  const firebaseApp = getApp();
  if (!firebaseApp || !tokens.length) return [];
  const messaging = getMessaging(firebaseApp);
  const stringData = Object.fromEntries(Object.entries(data || {}).map(([k, v]) => [k, String(v)]));
  const invalid = [];
  for (let i = 0; i < tokens.length; i += FCM_BATCH_SIZE) {
    const batch = tokens.slice(i, i + FCM_BATCH_SIZE);
    const result = await messaging.sendEachForMulticast({ tokens: batch, notification: { title, body }, data: stringData });
    result.responses.forEach((r, idx) => { if (!r.success && isUnregistered(r.error)) invalid.push(batch[idx]); });
  }
  return invalid;
}

/** Pushes to every device of the given accounts (ids may belong to any role collection) and prunes dead tokens. */
async function sendPushToAccounts(accountIds, payload) {
  if (!getApp()) return;
  const ids = [...new Set((accountIds || []).filter(Boolean).map(String))];
  if (!ids.length) return;
  for (const Model of Object.values(MODEL_BY_ROLE)) {
    const accounts = await Model.find({ _id: { $in: ids }, fcmTokens: { $exists: true, $ne: [] } }).select('+fcmTokens').lean();
    const tokens = [...new Set(accounts.flatMap((a) => a.fcmTokens))];
    const invalid = await sendToTokens(tokens, payload);
    if (invalid.length) await Model.updateMany({ _id: { $in: accounts.map((a) => a._id) } }, { $pullAll: { fcmTokens: invalid } });
  }
}

/** Admin broadcast: every active account of the given roles that has a saved token. */
async function sendPushToRoles(roles, payload) {
  if (!getApp()) return;
  for (const role of roles) {
    const Model = MODEL_BY_ROLE[role];
    if (!Model) continue;
    const accounts = await Model.find({ active: { $ne: false }, fcmTokens: { $exists: true, $ne: [] } }).select('+fcmTokens').lean();
    const tokens = [...new Set(accounts.flatMap((a) => a.fcmTokens))];
    const invalid = await sendToTokens(tokens, payload);
    if (invalid.length) await Model.updateMany({}, { $pullAll: { fcmTokens: invalid } });
  }
}

async function registerToken(role, accountId, token) {
  const Model = MODEL_BY_ROLE[role];
  if (!Model || !token) return;
  // A device token belongs to one account at a time (shared phone, logout/login as someone else).
  await Promise.all(Object.values(MODEL_BY_ROLE).map((M) => M.updateMany({ fcmTokens: token }, { $pull: { fcmTokens: token } })));
  await Model.findByIdAndUpdate(accountId, { $addToSet: { fcmTokens: token } });
}

async function unregisterToken(role, accountId, token) {
  const Model = MODEL_BY_ROLE[role];
  if (!Model || !token) return;
  await Model.findByIdAndUpdate(accountId, { $pull: { fcmTokens: token } });
}

module.exports = { sendPushToAccounts, sendPushToRoles, registerToken, unregisterToken };
