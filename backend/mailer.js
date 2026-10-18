import nodemailer from "nodemailer";
import { Resend } from "resend";

const smtpUser = process.env.GMASS_SMTP_USER || process.env.SMTP_USER;
const smtpPass = process.env.GMASS_SMTP_PASS || process.env.SMTP_PASS;
const smtpHost = process.env.GMASS_SMTP_HOST || process.env.SMTP_HOST || (smtpUser?.toLowerCase().endsWith("@gmail.com") ? "smtp.gmail.com" : undefined);
const smtpPort = Number(process.env.GMASS_SMTP_PORT || process.env.SMTP_PORT) || 587;
const emailFrom = process.env.EMAIL_FROM || process.env.GMASS_SMTP_FROM || process.env.SMTP_FROM || (smtpUser && smtpUser !== "gmass" ? smtpUser : undefined) || process.env.RESEND_FROM || "onboarding@resend.dev";
const gmassSenderConfigured = Boolean(process.env.EMAIL_FROM || process.env.GMASS_SMTP_FROM || process.env.SMTP_FROM);

// Prefer the configured SMTP transport for all platform email.
const smtpAuthPass = smtpHost === "smtp.gmail.com" ? String(smtpPass || "").replace(/\s+/g, "") : smtpPass;
const smtpRequested = Boolean(
  process.env.GMASS_SMTP_HOST || process.env.GMASS_SMTP_USER || process.env.GMASS_SMTP_PASS || process.env.GMASS_SMTP_PORT ||
  process.env.SMTP_HOST || process.env.SMTP_USER || process.env.SMTP_PASS
);
const smtpEnabled = Boolean(smtpHost && smtpUser && smtpAuthPass);

let transporter = null;
if (smtpEnabled) {
  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465, // SSL for 465, STARTTLS for 587
    auth: { user: smtpUser, pass: smtpAuthPass },
  });
  console.log(`✉ Mailer: using SMTP (${smtpHost}:${smtpPort})`);
} else {
  console.log("✉ Mailer: SMTP not configured");
}

let resend = null;
if (process.env.RESEND_API_KEY) {
  try {
    resend = new Resend(process.env.RESEND_API_KEY);
  } catch (err) {
    console.error("Resend client init failed:", err?.message || err);
  }
}

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
    if (smtpEnabled) {
      if (smtpUser === "gmass" && !gmassSenderConfigured) throw new Error("Set EMAIL_FROM or GMASS_SMTP_FROM to the connected Gmail address for GMass SMTP.");
      return await sendViaSmtp(to, subject, html);
    }
    if (smtpRequested) throw new Error("SMTP is configured incompletely. Set the SMTP host, username, and password.");
    if (resend) return await sendViaResend(to, subject, html);
    throw new Error("Email is not configured. Configure Gmail SMTP or RESEND_API_KEY.");
  } catch (err) {
    console.error("sendMail failed:", err?.message || err);
    throw err;
  }
}
