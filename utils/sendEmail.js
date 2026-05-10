// utils/sendEmail.js

import dotenv from "dotenv";
import nodemailer from "nodemailer";

dotenv.config();

const sendEmail = async (options) => {
  if (!options.to) {
    throw new Error("Recipient email is required");
  }

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false, // true only for port 465

      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS, // Gmail App Password
      },

      // Prevent Render timeout hanging
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,

      tls: {
        rejectUnauthorized: false,
      },
    });

    // Verify SMTP connection
    await transporter.verify();

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: options.to,
      subject: options.subject,
      text: options.text || "",
      html: options.html || null,
    };

    const info = await transporter.sendMail(mailOptions);

    console.log(`Email sent to ${options.to}: ${info.messageId}`);

    return info;
  } catch (error) {
    console.error("EMAIL ERROR:", error);

    throw new Error(
      error?.message || "Email could not be sent"
    );
  }
};

export default sendEmail;
