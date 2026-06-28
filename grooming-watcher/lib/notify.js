'use strict';

const nodemailer = require('nodemailer');

/**
 * Build a transporter from env. Supports any SMTP server; defaults to Gmail.
 * Required env: SMTP_USER, SMTP_PASS.
 * Optional: SMTP_HOST (default smtp.gmail.com), SMTP_PORT (default 465), SMTP_SECURE (default true).
 */
function buildTransport() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return null;

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true') === 'true',
    auth: { user, pass },
  });
}

/**
 * Send an email. Silently no-ops (logs) if SMTP isn't configured, so a missing
 * secret never crashes the watcher.
 *
 * @param {{subject:string, text:string, html?:string, attachments?:Array}} msg
 */
async function sendEmail(msg) {
  const transport = buildTransport();
  const to = process.env.NOTIFY_TO;
  if (!transport || !to) {
    console.log('[notify] SMTP not configured (need SMTP_USER, SMTP_PASS, NOTIFY_TO) — skipping email.');
    console.log(`[notify] Would have sent: ${msg.subject}`);
    return false;
  }

  const from = process.env.NOTIFY_FROM || process.env.SMTP_USER;
  await transport.sendMail({
    from,
    to,
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
    attachments: msg.attachments || [],
  });
  console.log(`[notify] Sent email "${msg.subject}" to ${to}`);
  return true;
}

module.exports = { sendEmail };
