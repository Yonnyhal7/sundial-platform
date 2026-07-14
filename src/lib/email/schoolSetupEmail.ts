function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatExpiration(expiresAt: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
    timeZoneName: "short",
  }).format(expiresAt);
}

export function renderSchoolSetupEmail({
  schoolName,
  setupUrl,
  expiresAt,
}: {
  schoolName: string;
  setupUrl: string;
  expiresAt: Date;
}) {
  const safeSchoolName = escapeHtml(schoolName);
  const safeUrl = escapeHtml(setupUrl);
  const expiration = formatExpiration(expiresAt);
  const safeExpiration = escapeHtml(expiration);

  return {
    subject: "Set up your school in Sundial",
    html: `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f1f5f9;color:#0f172a;font-family:Arial,sans-serif">
    <div style="display:none;max-height:0;overflow:hidden">Complete setup for ${safeSchoolName} in Sundial.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:32px 16px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden">
          <tr><td style="background:#0f172a;padding:24px 32px;color:#ffffff;font-size:24px;font-weight:700">Sundial</td></tr>
          <tr><td style="padding:32px">
            <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2">Set up ${safeSchoolName}</h1>
            <p style="margin:0 0 24px;color:#475569;line-height:1.6">You have been invited to set up your school in Sundial. Create your administrator account to begin configuring your school.</p>
            <table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="border-radius:8px;background:#2563eb"><a href="${safeUrl}" style="display:inline-block;padding:14px 24px;color:#ffffff;text-decoration:none;font-weight:700">Set Up School</a></td></tr></table>
            <p style="margin:24px 0 0;color:#64748b;font-size:14px;line-height:1.5">This invitation expires ${safeExpiration}.</p>
            <p style="margin:16px 0 0;color:#64748b;font-size:14px;line-height:1.5">If you were not expecting this invitation, you can safely ignore this message.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`,
    text: `Set up your school in Sundial

You have been invited to set up ${schoolName} in Sundial.

Set Up School: ${setupUrl}

This invitation expires ${expiration}.

If you were not expecting this invitation, you can safely ignore this message.`,
  };
}
