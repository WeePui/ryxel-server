import nodemailer from 'nodemailer';
import path from 'path';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

const sendEmail = async (options: EmailOptions): Promise<void> => {
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT),
    // service: process.env.EMAIL_SERVICE, (production)
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
    attachments: [
      {
        filename: 'logo.png',
        path: path.join(__dirname, 'logo.png'),
        cid: 'logo',
      },
    ],
  };

  await transporter.sendMail(mailOptions);
};

export default sendEmail;
