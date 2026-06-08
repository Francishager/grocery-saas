import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY || "re_XerCSLKz_5fpGtz8VNMZaYEfjRh8X9eKY");
const emailFrom = process.env.EMAIL_FROM || "onboarding@resend.dev";

export async function sendMail(to, subject, html) {
  try {
    const { data, error } = await resend.emails.send({ from: emailFrom, to, subject, html });
    if (error) {
      console.error("Resend error:", error);
      throw error;
    }
    console.log("Email sent via Resend to", to, "| id:", data?.id);
    return { messageId: data?.id };
  } catch (err) {
    console.error("sendMail failed:", err?.message || err);
    throw err;
  }
}
