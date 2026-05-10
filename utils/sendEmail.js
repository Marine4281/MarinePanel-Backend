import nodemailer from "nodemailer";

// sendEmail({ to, subject, text, resetLink })
const sendEmail = async ({ to, subject, text, resetLink }) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "marinepanel6@gmail.com",
        pass: "pzae gqke djjz vxeo",
      },
      connectionTimeout: 30000,
      greetingTimeout: 30000,
      socketTimeout: 30000,
    });

    await transporter.verify();

    console.log("SMTP server is ready");

    const emailMessage =
      text ||
      `
Hello,

You requested a password reset for your Marine Panel account.

Click the link below to reset your password:

${resetLink}

If you did not request this reset, please ignore this email.

- Marine Panel Team
`;

    const info = await transporter.sendMail({
      from: `"Marine Panel" <marinepanel6@gmail.com>`,
      to,
      subject: subject || "Marine Panel Password Reset",
      text: emailMessage,
    });

    console.log("Email sent:", info.messageId);

    return info;
  } catch (error) {
    console.error("Email error:", error);
    throw new Error("Email could not be sent");
  }
};

export default sendEmail;
