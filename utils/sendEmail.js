// utils/sendEmail.js

import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const DEFAULT_BRAND = {
  brandName: "Marine Panel",
  themeColor: "#2563eb",
  logo: null,
  domain: "marinepanel.online",
};

// sendEmail({ to, subject, text, resetLink, brand })
const sendEmail = async ({ to, subject, text, resetLink, brand }) => {
  try {
    const b = {
      brandName: brand?.brandName || DEFAULT_BRAND.brandName,
      themeColor: brand?.themeColor || DEFAULT_BRAND.themeColor,
      logo: brand?.logo || null,
      domain: brand?.domain || DEFAULT_BRAND.domain,
    };

    // Plain text fallback
    const plainText =
      text ||
      `
Hello,

You requested a password reset for your ${b.brandName} account.

Reset your password here:
${resetLink}

If you did not request this, please ignore this email.

- ${b.brandName} Team
`;

    const logoBlock = b.logo
      ? `<img src="${b.logo}" alt="${b.brandName}" style="max-height:40px;margin-bottom:8px;" />`
      : `<h1 style="color:#ffffff;margin:0;font-size:28px;">${b.brandName}</h1>`;

    // Professional HTML Email
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Password Reset</title>
</head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:40px 0;">
    <tr>
      <td align="center">

        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td align="center" style="background:${b.themeColor};padding:35px 20px;">
              ${logoBlock}
              <p style="color:#ffffff;opacity:0.85;margin-top:8px;font-size:14px;">
                Secure Account Services
              </p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:40px 35px;">

              <h2 style="margin-top:0;color:#111827;font-size:24px;">
                Reset Your Password
              </h2>

              <p style="font-size:16px;line-height:1.7;color:#4b5563;">
                We received a request to reset the password for your
                ${b.brandName} account.
              </p>

              <p style="font-size:16px;line-height:1.7;color:#4b5563;">
                Click the button below to create a new password:
              </p>

              <!-- Button -->
              <table cellpadding="0" cellspacing="0" style="margin:30px 0;">
                <tr>
                  <td align="center" bgcolor="${b.themeColor}" style="border-radius:10px;">
                    <a
                      href="${resetLink}"
                      style="
                        display:inline-block;
                        padding:16px 32px;
                        font-size:16px;
                        color:#ffffff;
                        text-decoration:none;
                        font-weight:bold;
                      "
                    >
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>

              <p style="font-size:14px;color:#6b7280;line-height:1.6;">
                If the button above does not work, copy and paste this link into your browser:
              </p>

              <p style="word-break:break-all;font-size:14px;color:${b.themeColor};">
                ${resetLink}
              </p>

              <hr style="border:none;border-top:1px solid #e5e7eb;margin:35px 0;" />

              <p style="font-size:14px;line-height:1.6;color:#6b7280;">
                If you did not request a password reset, you can safely ignore this email.
                Your password will remain unchanged.
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="background:#f9fafb;padding:25px;">

              <p style="margin:0;font-size:13px;color:#6b7280;">
                © ${new Date().getFullYear()} ${b.brandName}. All rights reserved.
              </p>

              <p style="margin-top:8px;font-size:12px;color:#9ca3af;">
                ${b.domain}
              </p>

            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>
`;

    // Send email
    const data = await resend.emails.send({
      from: `${b.brandName} <noreply@marinepanel.online>`,
      to,
      subject: subject || "Reset Your Password",
      text: plainText,
      html,
    });

    console.log("Email sent:", data);

    return data;
  } catch (error) {
    console.error("Email error:", error);
    throw new Error("Email could not be sent");
  }
};

export default sendEmail;
