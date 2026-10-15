// Sends the OTP through SMS India Hub. Only used when USE_DEFAULT_OTP is not 'true'.
// The message text must match the DLT template registered for SMS_INDIA_HUB_DLT_TEMPLATE_ID.
async function sendOtpSms(phone, otp) {
  const digits = String(phone || '').replace(/\D/g, '');
  const msisdn = digits.length > 10 && digits.startsWith('91') ? digits : `91${digits}`;
  const url = new URL('http://cloud.smsindiahub.in/vendorsms/pushsms.aspx');
  const q = {
    APIKey: process.env.SMS_INDIA_HUB_API_KEY, sid: process.env.SMS_INDIA_HUB_SENDER_ID, msisdn,
    msg: `Your Servoshakti OTP is ${otp}. Do not share this with anyone.`, gwid: '2', fl: '0',
    uname: process.env.SMS_INDIA_HUB_USERNAME, DLT_TE_ID: process.env.SMS_INDIA_HUB_DLT_TEMPLATE_ID,
  };
  Object.entries(q).forEach(([k, v]) => v && url.searchParams.append(k, v));
  const res = await fetch(url.toString());
  const text = await res.text();
  if (!res.ok) throw new Error(`SMS gateway error: ${text.slice(0, 120)}`);
}

module.exports = { sendOtpSms };
