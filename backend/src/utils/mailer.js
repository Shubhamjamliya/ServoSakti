const nodemailer = require('nodemailer');

let cachedTransporter = null;

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  const host = process.env.EMAIL_HOST;
  const port = Number(process.env.EMAIL_PORT) || 587;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!host || !user || !pass) {
    throw new Error('SMTP credentials (EMAIL_HOST, EMAIL_USER, EMAIL_PASS) are not configured');
  }

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return cachedTransporter;
}

/**
 * Send an email via configured SMTP server.
 * Skips network delivery in NODE_ENV=test when SMTP is not configured.
 */
async function sendMail({ to, subject, html, text }) {
  if (process.env.NODE_ENV === 'test') {
    return { skipped: true };
  }
  const transporter = getTransporter();
  const from = process.env.EMAIL_FROM || `Aftenza <${process.env.EMAIL_USER}>`;
  return transporter.sendMail({ from, to, subject, html, text });
}

async function sendAdminResetOtpEmail({ to, name, code }) {
  const safeName = name || 'Admin';
  const subject = 'Aftenza Admin — Password Reset Verification Code';
  const text = `Hi ${safeName},\n\nYour Aftenza Admin password reset verification code is: ${code}\n\nThis code expires in 10 minutes. If you did not request a password reset, please ignore this email.\n`;
  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #f8fafc; padding: 28px 20px;">
      <div style="background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 32px 28px;">
        <div style="font-size: 12px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #0066ff; margin-bottom: 8px;">
          Aftenza Control Tower
        </div>
        <h2 style="margin: 0 0 12px; font-size: 22px; color: #0f172a;">Password Reset Request</h2>
        <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #475569;">
          Hi ${safeName}, use the 6-digit verification code below to reset your Aftenza Admin password.
        </p>
        <div style="background: #f1f5f9; border: 1px dashed #cbd5e1; border-radius: 12px; padding: 18px; text-align: center; margin-bottom: 20px;">
          <span style="font-size: 30px; font-weight: 800; letter-spacing: 0.28em; color: #0f172a;">${code}</span>
        </div>
        <p style="margin: 0; font-size: 12.5px; line-height: 1.5; color: #64748b;">
          This code is valid for <strong>10 minutes</strong>. If you didn&apos;t request this, you can safely ignore this email.
        </p>
      </div>
    </div>
  `;
  return sendMail({ to, subject, html, text });
}

module.exports = { sendMail, sendAdminResetOtpEmail };
