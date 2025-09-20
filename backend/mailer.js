import nodemailer from "nodemailer";

const smtpHost = process.env.SMTP_HOST;
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const smtpFrom = process.env.SMTP_FROM || smtpUser;

let transporter;

export function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined,
    });
  }
  return transporter;
}

export async function sendMail(to, subject, html) {
  if (!smtpHost) {
    console.warn("SMTP not configured; skipping email to", to);
    return { skipped: true };
  }
  const tx = getTransporter();
  const info = await tx.sendMail({ from: smtpFrom, to, subject, html });
  return { messageId: info.messageId };
}
