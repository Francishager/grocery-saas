import nodemailer from "nodemailer";
import { Resend } from "resend";

const emailFrom =
  process.env.EMAIL_FROM ||
  process.env.SMTP_USER ||
  "onboarding@resend.dev";

// Prefer SMTP (e.g. Gmail) when configured, otherwise fall back to Resend.
const smtpHost = process.env.SMTP_HOST;
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const smtpEnabled = Boolean(smtpHost && smtpUser && smtpPass);

let transporter = null;
if (smtpEnabled) {
  const port = Number(process.env.SMTP_PORT) || 587;
  transporter = nodemailer.createTransport({
    host: smtpHost,
    port,
    secure: port === 465, // SSL for 465, STARTTLS for 587
    auth: { user: smtpUser, pass: smtpPass },
  });
  console.log(`✉ Mailer: using SMTP (${smtpHost}:${port}) as ${smtpUser}`);
} else {
  console.log("✉ Mailer: SMTP not configured, falling back to Resend");
}

const resend = new Resend(
  process.env.RESEND_API_KEY || "re_XerCSLKz_5fpGtz8VNMZaYEfjRh8X9eKY"
);

async function sendViaSmtp(to, subject, html) {
  const info = await transporter.sendMail({
    from: emailFrom,
    to,
    subject,
    html,
  });
  console.log("Email sent via SMTP to", to, "| id:", info?.messageId);
  return { messageId: info?.messageId };
}

async function sendViaResend(to, subject, html) {
  const { data, error } = await resend.emails.send({
    from: emailFrom,
    to,
    subject,
    html,
  });
  if (error) {
    console.error("Resend error:", error);
    throw error;
  }
  console.log("Email sent via Resend to", to, "| id:", data?.id);
  return { messageId: data?.id };
}

export async function sendMail(to, subject, html) {
  try {
    if (smtpEnabled) return await sendViaSmtp(to, subject, html);
    return await sendViaResend(to, subject, html);
  } catch (err) {
    console.error("sendMail failed:", err?.message || err);
    throw err;
  }
}
