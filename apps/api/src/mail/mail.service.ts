import { Injectable, Logger } from "@nestjs/common";
import { createTransport, type Transporter } from "nodemailer";

// SMTP_HOST (+ SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_SECURE=1, MAIL_FROM)
// turn on real delivery. Without them messages are only written to the log,
// which is enough for development: the links are in the text.
@Injectable()
export class MailService {
  private readonly log = new Logger(MailService.name);
  private readonly transport?: Transporter;
  private readonly from = process.env.MAIL_FROM ?? "Plano <no-reply@localhost>";

  constructor() {
    if (process.env.SMTP_HOST) {
      this.transport = createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === "1",
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
      });
    }
  }

  get enabled() {
    return !!this.transport;
  }

  // Never throws: a mail outage must not break inviting or resetting; the
  // caller gets `false` and can show the link instead.
  async send(to: string, subject: string, text: string): Promise<boolean> {
    if (!this.transport) {
      this.log.log(`(mail not configured) to ${to}: ${subject}\n${text}`);
      return false;
    }
    try {
      await this.transport.sendMail({ from: this.from, to, subject, text });
      return true;
    } catch (e) {
      this.log.error(`Sending to ${to} failed: ${(e as Error).message}`);
      return false;
    }
  }
}
