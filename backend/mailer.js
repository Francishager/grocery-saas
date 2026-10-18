import nodemailer from "nodemailer";
import { Resend } from "resend";

let smtpTransport = null;
let smtpTransportKey = null;
let resendClient = null;
let resendApiKey = null;

function readMailConfig() {
  const smtpUser = process.env.GMASS_SMTP_USER || process.env.SMTP_USER;
  const smtpPass = process.env.GMASS_SMTP_PASS || process.env.SMTP_PASS;
  const smtpHost = process.env.GMASS_SMTP_HOST || process.env.SMTP_HOST || (smtpUser?.toLowerCase().endsWith("@gmail.com") ? "smtp.gmail.com" : undefined);
  const smtpPort = Number(process.env.GMASS_SMTP_PORT || process.env.SMTP_PORT) || 587;
  const sender = process.env.EMAIL_FROM || process.env.GMASS_SMTP_FROM || process.env.SMTP_FROM || (smtpUser && smtpUser.toLowerCase() !== "gmass" ? smtpUser : undefined) || process.env.RESEND_FROM || "onboarding@resend.dev";
  const smtpRequested = Boolean(
    process.env.GMASS_SMTP_HOST || process.env.GMASS_SMTP_USER || process.env.GMASS_SMTP_PASS || process.env.GMASS_SMTP_PORT ||
    process.env.SMTP_HOST || process.env.SMTP_USER || process.env.SMTP_PASS
  );
  const smtpConfigured = Boolean(smtpHost && smtpUser && smtpPass);

  return { smtpHost, smtpPort, smtpUser, smtpPass, sender, smtpRequested, smtpConfigured };
}

function getSmtpTransport(config) {
  const key = `${config.smtpHost}:${config.smtpPort}:${config.smtpUser}:${config.smtpPass}`;
  if (!smtpTransport || key !== smtpTransportKey) {
    smtpTransport = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpPort === 465,
      requireTLS: config.smtpPort === 587,
      connectionTimeout: 7000,
      greetingTimeout: 7000,
      socketTimeout: 12000,
      auth: { user: config.smtpUser, pass: config.smtpPass },
    });
    smtpTransportKey = key;
  }
  return smtpTransport;
}

function getResendClient() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!resendClient || key !== resendApiKey) {
    resendClient = new Resend(key);
    resendApiKey = key;
  }
  return resendClient;
}

export async function verifyMailTransport() {
  const config = readMailConfig();
  if (config.smtpConfigured) {
    if (config.smtpUser.toLowerCase() === "gmass" && !(process.env.EMAIL_FROM || process.env.GMASS_SMTP_FROM || process.env.SMTP_FROM)) {
      throw new Error("Set EMAIL_FROM or GMASS_SMTP_FROM to the connected Gmail address for GMass SMTP.");
    }
    await getSmtpTransport(config).verify();
    return { provider: "smtp", host: config.smtpHost, port: config.smtpPort };
  }
  if (config.smtpRequested) throw new Error("SMTP is configured incompletely. Set the SMTP host, username, and password.");
  if (getResendClient()) return { provider: "resend" };
  throw new Error("Email is not configured. Configure GMass/Gmail SMTP or RESEND_API_KEY.");
}

export async function sendMail(to, subject, html) {
  const config = readMailConfig();
  try {
    if (config.smtpConfigured) {
      if (config.smtpUser.toLowerCase() === "gmass" && !(process.env.EMAIL_FROM || process.env.GMASS_SMTP_FROM || process.env.SMTP_FROM)) {
        throw new Error("Set EMAIL_FROM or GMASS_SMTP_FROM to the connected Gmail address for GMass SMTP.");
      }
      const info = await getSmtpTransport(config).sendMail({ from: config.sender, to, subject, html });
      console.log("Email sent via SMTP", { to, messageId: info?.messageId });
      return { messageId: info?.messageId };
    }
    if (config.smtpRequested) throw new Error("SMTP is configured incompletely. Set the SMTP host, username, and password.");

    const resend = getResendClient();
    if (!resend) throw new Error("Email is not configured. Configure GMass/Gmail SMTP or RESEND_API_KEY.");
    const { data, error } = await resend.emails.send({ from: config.sender, to, subject, html });
    if (error) throw error;
    console.log("Email sent via Resend", { to, messageId: data?.id });
    return { messageId: data?.id };
  } catch (error) {
    console.error("Email delivery failed", {
      provider: config.smtpRequested ? "smtp" : process.env.RESEND_API_KEY ? "resend" : "unconfigured",
      host: config.smtpHost,
      code: error?.code,
      responseCode: error?.responseCode,
      message: error?.message || "Email delivery failed",
    });
    throw error;
  }
}
