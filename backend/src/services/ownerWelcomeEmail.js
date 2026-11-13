function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character])
}

export function buildOwnerWelcomeEmail({
  ownerFname,
  businessName,
  businessId,
  tempPassword,
  otp,
  loginUrl,
  existingAccount = false,
}) {
  const name = escapeHtml(String(ownerFname || '').trim() || 'there')
  const business = escapeHtml(businessName)
  const safeBusinessId = escapeHtml(businessId)
  const safeLoginUrl = escapeHtml(loginUrl)
  const subjectName = String(businessName || 'your business').replace(/[\r\n]+/g, ' ').trim()
  const subject = existingAccount
    ? `Welcome to JibuSales, ${subjectName} is ready`
    : `Welcome to JibuSales, ${subjectName} is ready to grow`
  const accessDetails = existingAccount
    ? `<p style="margin:0 0 12px">Your existing JibuSales sign-in remains the same. Open your account and choose <strong>${business}</strong> from the business switcher. Its records stay separate from your other businesses.</p>`
    : `<div style="margin:22px 0;padding:18px 20px;background:#f4f8fb;border:1px solid #dce7ef;border-radius:8px">
        <p style="margin:0 0 8px"><strong>Business:</strong> ${business}</p>
        <p style="margin:0 0 8px"><strong>Business reference:</strong> ${safeBusinessId}</p>
        <p style="margin:0 0 8px"><strong>Temporary password:</strong> ${escapeHtml(tempPassword)}</p>
        <p style="margin:0"><strong>One-time setup code:</strong> ${escapeHtml(otp)} <span style="color:#52616b">(expires in 24 hours)</span></p>
      </div>
      <p style="margin:0 0 12px">At first sign-in, use the one-time code to set your personal password. Keep the code private and do not forward this email.</p>`
  const html = `<!doctype html>
<html lang="en"><body style="margin:0;padding:24px 12px;background:#f3f6f8;font-family:Arial,Helvetica,sans-serif;color:#18232d">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">Your JibuSales business workspace is ready.</div>
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e1e8ed;border-radius:10px;overflow:hidden">
    <tr><td style="padding:26px 30px;background:#123b52;color:#ffffff"><div style="font-size:14px;font-weight:bold;letter-spacing:.5px">JibuSales</div><div style="margin-top:18px;font-size:25px;line-height:1.25;font-weight:bold">Welcome${existingAccount ? ' back' : ''}, ${name}!</div><div style="margin-top:8px;font-size:15px;line-height:1.5;color:#e3f1f7">${business} is ready for you.</div></td></tr>
    <tr><td style="padding:28px 30px;font-size:15px;line-height:1.65">
      <p style="margin:0 0 14px">We’re glad to welcome you to JibuSales. Your business workspace brings everyday operations into one place, helping you keep track of sales, stock, customers, cashflow, and business reports as you serve and grow your business.</p>
      ${accessDetails}
      <p style="margin:18px 0 20px">Start by signing in to explore your workspace and make it your own.</p>
      <p style="margin:0 0 24px"><a href="${safeLoginUrl}" style="display:inline-block;padding:12px 22px;background:#087e78;color:#ffffff;text-decoration:none;font-weight:bold;border-radius:6px">Open JibuSales</a></p>
      <p style="margin:0 0 10px;color:#52616b;font-size:13px">Need help getting started? Reply to this email and our team will be happy to help.</p>
      <p style="margin:18px 0 0">Here’s to a confident start,<br><strong>The JibuSales Team</strong></p>
    </td></tr>
    <tr><td style="padding:16px 30px;background:#f7f9fa;border-top:1px solid #e7edf0;color:#72808a;font-size:11px;line-height:1.5">This message was sent to the owner email provided when the business account was created.</td></tr>
  </table>
</body></html>`
  return { subject, html }
}
