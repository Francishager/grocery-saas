import nodemailer from "nodemailer";
import { Resend } from "resend";

let smtpTransport = null;
let smtpTransportKey = null;
let resendClient = null;
let resendApiKey = null;

function readMailConfig() {
  const emailProvider = String(process.env.EMAIL_PROVIDER || "auto").trim().toLowerCase();
  const smtp2goApiKey = process.env.SMTP2GO_API_KEY?.trim();
  const smtp2goFrom = process.env.SMTP2GO_FROM?.trim();
  const smtp2goApiUrl = process.env.SMTP2GO_API_URL || "https://eu-api.smtp2go.com/v3/email/send";
  const smtpUser = process.env.GMASS_SMTP_USER || process.env.SMTP_USER;
  const smtpPass = process.env.GMASS_SMTP_PASS || process.env.SMTP_PASS;
  const smtpHost = process.env.GMASS_SMTP_HOST || process.env.SMTP_HOST || (smtpUser?.toLowerCase().endsWith("@gmail.com") ? "smtp.gmail.com" : undefined);
  const smtpPort = Number(process.env.GMASS_SMTP_PORT || process.env.SMTP_PORT) || 587;
  const sender = (emailProvider === "resend" ? process.env.RESEND_FROM || process.env.EMAIL_FROM : process.env.EMAIL_FROM || process.env.GMASS_SMTP_FROM || process.env.SMTP_FROM) || (smtpUser && smtpUser.toLowerCase() !== "gmass" ? smtpUser : undefined) || process.env.RESEND_FROM || "onboarding@resend.dev";
  const smtpRequested = Boolean(
    process.env.GMASS_SMTP_HOST || process.env.GMASS_SMTP_USER || process.env.GMASS_SMTP_PASS || process.env.GMASS_SMTP_PORT ||
    process.env.SMTP_HOST || process.env.SMTP_USER || process.env.SMTP_PASS
  );
  const smtpConfigured = Boolean(smtpHost && smtpUser && smtpPass);

  return { emailProvider, smtp2goApiKey, smtp2goFrom, smtp2goApiUrl, smtpHost, smtpPort, smtpUser, smtpPass, sender, smtpRequested, smtpConfigured };
}

function describeMailError(error) {
  const code = String(error?.code || "");
  const railway = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_NAME);
  if (railway && ["ETIMEDOUT", "ECONNECTION", "ECONNREFUSED", "ENETUNREACH", "EHOSTUNREACH"].includes(code)) {
    return "Railway could not reach the SMTP server. Outbound SMTP requires Railway Pro; on Free, Trial, or Hobby, set EMAIL_PROVIDER=resend and configure a valid RESEND_API_KEY and RESEND_FROM, or upgrade the Railway plan.";
  }
  return error?.message || "Email delivery failed";
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
  if (config.emailProvider === "smtp2go") {
    if (!config.smtp2goApiKey) throw new Error("EMAIL_PROVIDER=smtp2go requires SMTP2GO_API_KEY.");
    if (!config.smtp2goFrom) throw new Error("EMAIL_PROVIDER=smtp2go requires SMTP2GO_FROM to be a verified SMTP2GO sender address.");
    return { provider: "smtp2go-api", host: new URL(config.smtp2goApiUrl).host };
  }
  if (config.emailProvider === "resend") {
    if (!getResendClient()) throw new Error("EMAIL_PROVIDER=resend requires RESEND_API_KEY.");
    if (!process.env.RESEND_FROM) throw new Error("Set RESEND_FROM to a sender address verified by Resend.");
    return { provider: "resend" };
  }
  if (config.emailProvider !== "auto" && config.emailProvider !== "smtp") {
    throw new Error("EMAIL_PROVIDER must be auto, smtp, resend, or smtp2go.");
  }
  if (config.smtpConfigured) {
    if (config.smtpUser.toLowerCase() === "gmass" && !(process.env.EMAIL_FROM || process.env.GMASS_SMTP_FROM || process.env.SMTP_FROM)) {
      throw new Error("Set EMAIL_FROM or GMASS_SMTP_FROM to the connected Gmail address for GMass SMTP.");
    }
    try {
      await getSmtpTransport(config).verify();
    } catch (error) {
      throw new Error(describeMailError(error), { cause: error });
    }
    return { provider: "smtp", host: config.smtpHost, port: config.smtpPort };
  }
  if (config.smtpRequested) throw new Error("SMTP is configured incompletely. Set the SMTP host, username, and password.");
  if (getResendClient()) return { provider: "resend" };
  throw new Error("Email is not configured. Configure GMass/Gmail SMTP or RESEND_API_KEY.");
}

export async function sendMail(to, subject, html) {
  const config = readMailConfig();
  try {
    if (config.emailProvider === "smtp2go") {
      if (!config.smtp2goApiKey) throw new Error("EMAIL_PROVIDER=smtp2go requires SMTP2GO_API_KEY.");
      if (!config.smtp2goFrom) throw new Error("EMAIL_PROVIDER=smtp2go requires SMTP2GO_FROM to be a verified SMTP2GO sender address.");
      const response = await fetch(config.smtp2goApiUrl, {
        method: "POST",
        headers: {
          "X-Smtp2go-Api-Key": config.smtp2goApiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          sender: config.smtp2goFrom,
          to: [to],
          subject,
          html_body: html,
          fastaccept: true,
        }),
        signal: AbortSignal.timeout(10000),
      });
      const result = await response.json().catch(() => ({}));
      const data = result?.data || {};
      if (!response.ok || Number(data.failed || 0) > 0 || Number(data.succeeded || 0) < 1) {
        const reason = data.error || data.failures?.map((item) => item?.error || item?.message).filter(Boolean).join("; ") || result?.error || `HTTP ${response.status}`;
        throw new Error(`SMTP2GO API rejected the email: ${reason}`);
      }
      console.log("Email accepted via SMTP2GO API", { to, messageId: data.email_id || result?.request_id });
      return { messageId: data.email_id || result?.request_id };
    }
    if (config.emailProvider === "resend") {
      if (!process.env.RESEND_FROM) throw new Error("Set RESEND_FROM to a sender address verified by Resend.");
      const resend = getResendClient();
      if (!resend) throw new Error("EMAIL_PROVIDER=resend requires RESEND_API_KEY.");
      const { data, error } = await resend.emails.send({ from: process.env.RESEND_FROM, to, subject, html });
      if (error) throw error;
      console.log("Email sent via Resend", { to, messageId: data?.id });
      return { messageId: data?.id };
    }
    if (config.emailProvider !== "auto" && config.emailProvider !== "smtp") {
      throw new Error("EMAIL_PROVIDER must be auto, smtp, resend, or smtp2go.");
    }
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
      provider: config.emailProvider === "smtp2go" ? "smtp2go-api" : config.emailProvider === "resend" || process.env.RESEND_API_KEY ? "resend" : config.smtpRequested ? "smtp" : "unconfigured",
      host: config.smtpHost,
      code: error?.code,
      responseCode: error?.responseCode,
      message: describeMailError(error),
    });
    const message = describeMailError(error);
    if (message !== (error?.message || "Email delivery failed")) {
      const wrapped = new Error(message, { cause: error });
      wrapped.code = error?.code;
      wrapped.responseCode = error?.responseCode;
      throw wrapped;
    }
    throw error;
  }
}
