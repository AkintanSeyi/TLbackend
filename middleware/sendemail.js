import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

// Create the transporter using Gmail SMTP
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "akintanseyi5@gmail.com", // your aakintanseyi5@gmail.com
    pass: "xfgwemlrixymnhgk", // your 16-character App Password
  },
});

export async function sendEmail(to, subject, body = "", otp = null) {
  const mailOptions = {
    from: `"ThaLinq" <${process.env.EMAIL_USER}>`,
    to: to,
    subject: subject,
    // If OTP is provided, add it to the body; otherwise use the body text
    text: otp ? `Your OTP code is: ${otp}` : body,
    html: otp 
      ? `<b>Your OTP code is: ${otp}</b>` 
      : `<p>${body}</p>`,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent: " + info.response);
    return info;
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
}