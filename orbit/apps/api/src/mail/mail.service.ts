import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

/**
 * Transactional email — account setup & password reset ONLY.
 * Operational events are in-app notifications, never email (spec §11.1).
 *
 * If SMTP is not configured (dev), emails are logged to the console instead
 * of being sent, so the flow remains testable without an SMTP provider.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly from: string;
  private readonly frontendUrl: string;

  constructor(private readonly config: ConfigService) {
    const smtp = this.config.get('smtp');
    this.from = smtp.from;
    this.frontendUrl = this.config.getOrThrow<string>('frontendUrl');

    if (smtp.host && smtp.user) {
      this.transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: { user: smtp.user, pass: smtp.pass },
      });
    } else {
      this.logger.warn(
        'SMTP not configured — emails will be logged to the console instead of sent.',
      );
    }
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    if (!this.transporter) {
      this.logger.log(`[DEV EMAIL] To: ${to}\nSubject: ${subject}\n${html}`);
      return;
    }
    await this.transporter.sendMail({ from: this.from, to, subject, html });
  }

  /** Account activation link (48h). */
  async sendSetupEmail(to: string, fullName: string, token: string): Promise<void> {
    const link = `${this.frontendUrl}/set-password?token=${token}`;
    await this.send(
      to,
      'Activate your Orbit account',
      `<p>Hi ${fullName},</p>
       <p>An Orbit account has been created for you. Click below to set your password and activate your account. This link expires in 48 hours.</p>
       <p><a href="${link}">Activate account</a></p>
       <p>If the button doesn't work, paste this URL into your browser:<br>${link}</p>`,
    );
  }

  /** Password reset link (1h). */
  async sendResetEmail(to: string, fullName: string, token: string): Promise<void> {
    const link = `${this.frontendUrl}/reset-password?token=${token}`;
    await this.send(
      to,
      'Reset your Orbit password',
      `<p>Hi ${fullName},</p>
       <p>We received a request to reset your Orbit password. Click below to choose a new one. This link expires in 1 hour and can be used once.</p>
       <p><a href="${link}">Reset password</a></p>
       <p>If you didn't request this, you can safely ignore this email.</p>
       <p>If the button doesn't work, paste this URL into your browser:<br>${link}</p>`,
    );
  }
}
