import nodemailer, { type Transporter } from 'nodemailer';
import type { MailerPort } from './mailer-port.ts';

export type SmtpConfig = Readonly<{
  host: string;
  port: number;
  encryption: 'ssl' | 'tls';
  username: string;
  password: string;
  fromAddress: string;
  fromName: string;
  replyToAddress: string;
  timeoutSeconds: number;
  verifyPeer: boolean;
}>;

export class CpanelSmtpMailer implements MailerPort {
  readonly #transporter: Transporter;
  readonly #from: string;
  readonly #replyTo: string;

  constructor(config: SmtpConfig, transporter?: Transporter) {
    this.#from = `"${config.fromName.replaceAll('"', '')}" <${config.fromAddress}>`;
    this.#replyTo = config.replyToAddress;
    this.#transporter = transporter ?? nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.encryption === 'ssl',
      requireTLS: config.encryption === 'tls',
      auth: { user: config.username, pass: config.password },
      connectionTimeout: config.timeoutSeconds * 1000,
      socketTimeout: config.timeoutSeconds * 1000,
      tls: { rejectUnauthorized: config.verifyPeer },
    });
  }

  async verifyConnection(): Promise<void> {
    await this.#transporter.verify();
  }

  async sendRegistrationOtp(email: string, code: string, expiryMinutes: number): Promise<void> {
    await this.#transporter.sendMail({
      from: this.#from,
      replyTo: this.#replyTo,
      to: email,
      subject: 'Kode verifikasi Kartunama Digital',
      text: `Kode verifikasi Anda: ${code}. Kode berlaku ${expiryMinutes} menit. Jangan bagikan kode ini.`,
    });
  }

  async sendPasswordReset(email: string, resetUrl: string): Promise<void> {
    await this.#transporter.sendMail({
      from: this.#from,
      replyTo: this.#replyTo,
      to: email,
      subject: 'Reset password Kartunama Digital',
      text: `Gunakan tautan berikut untuk mereset password: ${resetUrl}\nJika Anda tidak meminta reset, abaikan email ini.`,
    });
  }

  async sendNotification(email:string,subject:string,text:string):Promise<void>{
    await this.#transporter.sendMail({
      from:this.#from,
      replyTo:this.#replyTo,
      to:email,
      subject,
      text,
    });
  }
}
