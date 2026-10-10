import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';
import { intEnv } from '../common/config/env.validation.js';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Sends transactional mail over SMTP (Mailpit in local/demo). Failures are logged, never thrown to the caller. */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Transporter;
  private readonly from: string;

  constructor(config: ConfigService) {
    this.transport = nodemailer.createTransport({
      host: config.get<string>('SMTP_HOST', 'localhost'),
      port: intEnv(config.get<string>('SMTP_PORT'), 1025),
      secure: false,
      // Signup awaits the verification mail; nodemailer's defaults (up to minutes) would outlast the app's 10s timeout.
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 5_000,
    });
    this.from = config.get<string>(
      'MAIL_FROM',
      'Music Room <no-reply@musicroom.local>',
    );
  }

  async send(mail: OutgoingMail): Promise<void> {
    try {
      await this.transport.sendMail({ from: this.from, ...mail });
    } catch (error) {
      this.logger.error(
        `Could not send "${mail.subject}": ${(error as Error).message}`,
      );
    }
  }

  sendVerification(
    to: string,
    displayName: string,
    link: string,
  ): Promise<void> {
    return this.send({
      to,
      subject: 'Confirm your Music Room email',
      text: `Hi ${displayName},\n\nConfirm your email to finish signing up:\n${link}\n\nThe link works once and expires in 24 hours.`,
      html: mailHtml(
        `Hi ${escapeHtml(displayName)},`,
        'Confirm your email to finish signing up.',
        link,
        'Confirm email',
        'The link works once and expires in 24 hours.',
      ),
    });
  }

  sendPasswordReset(
    to: string,
    displayName: string,
    link: string,
  ): Promise<void> {
    return this.send({
      to,
      subject: 'Reset your Music Room password',
      text: `Hi ${displayName},\n\nSet a new password here:\n${link}\n\nThe link works once and expires in 1 hour. If you didn't ask for this, ignore this email.`,
      html: mailHtml(
        `Hi ${escapeHtml(displayName)},`,
        'Set a new password with the button below.',
        link,
        'Reset password',
        "The link works once and expires in 1 hour. If you didn't ask for this, ignore this email.",
      ),
    });
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function mailHtml(
  greeting: string,
  lead: string,
  link: string,
  cta: string,
  footnote: string,
): string {
  const href = escapeHtml(link);
  return `<div style="font-family:Roboto,Arial,sans-serif;background:#0E0E12;color:#F2F1F7;padding:32px">
<p>${greeting}</p><p>${lead}</p>
<p><a href="${href}" style="display:inline-block;background:#8B5CF6;color:#fff;padding:12px 24px;border-radius:9999px;text-decoration:none">${cta}</a></p>
<p style="color:#A09FB0;font-size:13px">${footnote}<br>${href}</p></div>`;
}
