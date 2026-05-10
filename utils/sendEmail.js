import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async ({ to, subject, text, resetLink }) => {
  try {
    const message =
      text ||
      `
Hello,

You requested a password reset for your Marine Panel account.

Click the link below to reset your password:

${resetLink}

If you did not request this, ignore this email.

- Marine Panel Team
`;

    const data = await resend.emails.send({
      from: "Marine Panel <noreply@marinepanel.online>",
      to,
      subject: subject || "Password Reset",
      text: message,
    });

    console.log("Email sent:", data);
    return data;
  } catch (error) {
    console.error("Email error:", error);
    throw new Error("Email could not be sent");
  }
};

export default sendEmail;
