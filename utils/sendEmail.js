// utils/sendEmail.js

import nodemailer from "nodemailer";

// sendEmail({ to, subject, text })
const sendEmail = async ({ to, subject, text }) => {
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",       // Gmail SMTP
      port: 587,
      secure: false,                // false for 587
      auth: {
        user: "marinepanel6@gmail.com",  // EMAIL_USER
        pass: "pzae gqke djjz vxeo",        // EMAIL_PASS (App password)
      },
    });

    const info = await transporter.sendMail({
      from: `"Marine Panel" <marinepanel6@gmail.com>`, // EMAIL_FROM
      to,
      subject,
      text,
    });

    console.log("Email sent: %s", info.messageId);
  } catch (error) {
    console.error("Email error:", error);
    throw new Error("Email could not be sent");
  }
};

export default sendEmail;
