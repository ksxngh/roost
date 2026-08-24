// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BrevoMailer,
  ConsoleMailer,
  ResendMailer,
  createMailer,
} from "@/server/mailer";

const message = {
  to: "student@example.com",
  subject: "Verify your email",
  text: "https://example.com/verify?token=abc",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createMailer", () => {
  it("returns the console transport when no key is configured", () => {
    expect(
      createMailer({
        BREVO_API_KEY: undefined,
        RESEND_API_KEY: undefined,
        EMAIL_FROM: "a@b.co",
      }),
    ).toBeInstanceOf(ConsoleMailer);
  });

  it("returns the Resend transport when only a Resend key is configured", () => {
    expect(
      createMailer({
        BREVO_API_KEY: undefined,
        RESEND_API_KEY: "re_123",
        EMAIL_FROM: "a@b.co",
      }),
    ).toBeInstanceOf(ResendMailer);
  });

  it("returns the Brevo transport when a Brevo key is configured", () => {
    expect(
      createMailer({
        BREVO_API_KEY: "xkeysib-123",
        RESEND_API_KEY: undefined,
        EMAIL_FROM: "a@b.co",
      }),
    ).toBeInstanceOf(BrevoMailer);
  });

  it("prefers Brevo over Resend when both keys are configured", () => {
    expect(
      createMailer({
        BREVO_API_KEY: "xkeysib-123",
        RESEND_API_KEY: "re_123",
        EMAIL_FROM: "a@b.co",
      }),
    ).toBeInstanceOf(BrevoMailer);
  });
});

describe("ConsoleMailer", () => {
  it("logs recipient, subject, and body", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    await new ConsoleMailer().send(message);
    const logged = spy.mock.calls[0]?.[0] as string;
    expect(logged).toContain(message.to);
    expect(logged).toContain(message.subject);
    expect(logged).toContain(message.text);
  });
});

describe("ResendMailer", () => {
  it("posts the message to the Resend API with authorization", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    await new ResendMailer("re_key", "from@roost.app").send(message);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer re_key",
    );
    const body = JSON.parse(init?.body as string);
    expect(body).toMatchObject({
      from: "from@roost.app",
      to: message.to,
      subject: message.subject,
    });
  });

  it("throws a descriptive error when the API rejects the mail", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("invalid api key", { status: 401 }),
    );
    await expect(
      new ResendMailer("bad", "from@roost.app").send(message),
    ).rejects.toThrow(/401.*invalid api key/);
  });

  it("propagates network failures", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new TypeError("fetch failed"),
    );
    await expect(
      new ResendMailer("re_key", "from@roost.app").send(message),
    ).rejects.toThrow("fetch failed");
  });
});

describe("BrevoMailer", () => {
  it("posts the message to the Brevo API with the api-key header", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 201 }));

    await new BrevoMailer("xkeysib-key", "from@roost.app").send(message);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect((init?.headers as Record<string, string>)["api-key"]).toBe(
      "xkeysib-key",
    );
    const body = JSON.parse(init?.body as string);
    expect(body).toMatchObject({
      sender: { email: "from@roost.app" },
      to: [{ email: message.to }],
      subject: message.subject,
      textContent: message.text,
    });
  });

  it("throws a descriptive error when the API rejects the mail", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("unauthorized", { status: 401 }),
    );
    await expect(
      new BrevoMailer("bad", "from@roost.app").send(message),
    ).rejects.toThrow(/401.*unauthorized/);
  });
});
