import nodemailer from "nodemailer";

const resendApiKey = process.env.RESEND_API_KEY;
const emailFrom = process.env.EMAIL_FROM || process.env.SMTP_FROM || "noreply@watchafriview.com";

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

async function sendViaResend(to, subject, html) {
  const { default: Resend } = await import("resend");
  const resend = new Resend(resendApiKey);
  const { data, error } = await resend.emails.send({
    from: emailFrom,
    to,
    subject,
    html,
  });
  if (error) throw error;
  return { messageId: data?.id };
}

async function sendViaSmtp(to, subject, html) {
  const tx = getTransporter();
  const info = await tx.sendMail({ from: smtpFrom || emailFrom, to, subject, html });
  return { messageId: info.messageId };
}

export async function sendMail(to, subject, html) {
  if (resendApiKey) {
    try {
      const result = await sendViaResend(to, subject, html);
      console.log("Email sent via Resend to", to);
      return result;
    } catch (err) {
      console.error("Resend send failed:", err?.message || err);
      if (smtpHost) {
        console.log("Falling back to SMTP...");
        return sendViaSmtp(to, subject, html);
      }
      throw err;
    }
  }

  if (smtpHost) {
    return sendViaSmtp(to, subject, html);
  }

  console.warn("No email provider configured (RESEND_API_KEY or SMTP); skipping email to", to);
  console.warn("OTP/invitation details would have been sent to:", to, "| Subject:", subject);
  return { skipped: true };
}
