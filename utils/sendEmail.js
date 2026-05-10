// utils/sendEmail.js
require("dotenv").config();
const nodemailer = require("nodemailer");

const sendEmail = async (options) => {
  if (!options.email) throw new Error("Recipient email is required");

  try {
    // Configure Gmail SMTP
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,       // TLS port
      secure: false,   // false for 587
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS, // Gmail App Password
      },
    });

    // Email content
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: options.email,
      subject: options.subject,
      text: options.message,        // plain text fallback
      html: options.html || null,   // optional HTML content
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${options.email}`);
    return info;
  } catch (error) {
    console.error(`Email sending failed to ${options.email}:`, error.message);
    throw new Error("Email could not be sent");
  }
};

module.exports = sendEmail;
