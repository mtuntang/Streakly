import { describe, expect, test } from "bun:test";
import { resetPasswordEmail, sendEmail } from "../src/lib/mailer";

const RESEND = {
  NODE_ENV: "production",
  RESEND_API_KEY: "re_test_key",
  EMAIL_FROM: "Streakly <hello@streakly.example>",
} as NodeJS.ProcessEnv;
const LINK = "https://streakly.example/api/auth/reset-password/abc?callbackURL=x";

/** A fetch stand-in that records each call and answers with the given status. */
function recorder(status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response("{}", { status });
  };
  return { calls, fetchFn: fetchFn as typeof fetch };
}

describe("resetPasswordEmail", () => {
  test("carries the link and says when it expires, in text and html", () => {
    const email = resetPasswordEmail("pat@example.com", LINK);
    expect(email.to).toBe("pat@example.com");
    expect(email.subject).toBe("Reset your Streakly password");
    expect(email.text).toContain(LINK);
    expect(email.text).toContain("1 hour");
    expect(email.html).toContain(`href="${LINK.replace(/&/g, "&amp;")}"`);
  });
});

describe("sendEmail", () => {
  test("with a Resend key it posts the message to Resend", async () => {
    const { calls, fetchFn } = recorder();
    await sendEmail(resetPasswordEmail("pat@example.com", LINK), RESEND, fetchFn);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    expect(new Headers(calls[0].init.headers).get("authorization")).toBe("Bearer re_test_key");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toMatchObject({
      from: RESEND.EMAIL_FROM,
      to: ["pat@example.com"],
      subject: "Reset your Streakly password",
    });
  });

  test("a rejected send throws with the status", async () => {
    const { fetchFn } = recorder(422);
    await expect(sendEmail(resetPasswordEmail("pat@example.com", LINK), RESEND, fetchFn)).rejects.toThrow(/422/);
  });

  test("without a key in tests nothing is sent", async () => {
    const { calls, fetchFn } = recorder();
    await sendEmail(resetPasswordEmail("pat@example.com", LINK), { NODE_ENV: "test" } as NodeJS.ProcessEnv, fetchFn);
    expect(calls).toHaveLength(0);
  });
});
