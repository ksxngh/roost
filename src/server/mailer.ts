import { serverEnv } from "@/lib/env";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
};

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/**
 * Development transport: prints the mail to the server log so verification
 * and reset links are usable without an email provider.
 */
export class ConsoleMailer implements Mailer {
  async send(message: MailMessage): Promise<void> {
    console.info(
      [
        "",
        "━━━ StudyForge mail (console transport) ━━━",
        `To:      ${message.to}`,
        `Subject: ${message.subject}`,
        "",
        message.text,
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        "",
      ].join("\n"),
    );
  }
}

/** Production transport via Resend's REST API. */
export class ResendMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: MailMessage): Promise<void> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Resend rejected the email (${response.status}): ${body}`,
      );
    }
  }
}

/** Pick the transport from configuration: Resend when a key exists. */
export function createMailer(
  env: Pick<
    ReturnType<typeof serverEnv>,
    "RESEND_API_KEY" | "EMAIL_FROM"
  > = serverEnv(),
): Mailer {
  if (env.RESEND_API_KEY) {
    return new ResendMailer(env.RESEND_API_KEY, env.EMAIL_FROM);
  }
  return new ConsoleMailer();
}
