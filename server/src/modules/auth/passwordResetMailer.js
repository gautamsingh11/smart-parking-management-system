import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';

function createTransport() {
  if (!env.smtpHost || !env.smtpUser || !env.smtpPassword) return null;
  return nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth: { user: env.smtpUser, pass: env.smtpPassword },
  });
}

export const passwordResetMailer = {
  get configured() { return Boolean(env.smtpHost && env.smtpUser && env.smtpPassword); },
  async send(email, resetUrl) {
    const transport = createTransport();
    if (!transport) throw new Error('SMTP is not configured');
    await transport.sendMail({
      from: env.smtpFrom,
      to: email,
      subject: 'Reset your Parkwise password',
      text: `Use this one-time link to reset your password. It expires in ${env.passwordResetMinutes} minutes.\n\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
    });
  },
};
