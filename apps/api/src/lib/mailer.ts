/** An email ready to send: one recipient, a plain-text body and an HTML body. */
export type Email = { to: string; subject: string; text: string; html: string };

const RESEND_URL = "https://api.resend.com/emails";

/** Escapes text for use inside HTML, including attribute values. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Builds the password reset email around the link Better Auth generated. */
export function resetPasswordEmail(to: string, url: string): Email {
  const text = [
    "Someone asked to reset the password for your Streakly account.",
    "",
    "Choose a new password here:",
    url,
    "",
    "The link works once and expires in 1 hour.",
    "If you didn't ask for this, ignore this email. Your password stays the same.",
  ].join("\n");
  const link = escapeHtml(url);
  const html = `<p>Someone asked to reset the password for your Streakly account.</p>
<p><a href="${link}">Choose a new password</a></p>
<p>The link works once and expires in 1 hour.<br>If you didn't ask for this, ignore this email. Your password stays the same.</p>`;
  return { to, subject: "Reset your Streakly password", text, html };
}

/**
 * Sends an email through Resend when RESEND_API_KEY is set. Without a key,
 * development prints the email to the api log so the link can be opened
 * locally, and tests send nothing. Production can't reach this without a
 * key, because the boot guard requires one.
 */
export async function sendEmail(
  email: Email,
  env: NodeJS.ProcessEnv = process.env,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    if (env.NODE_ENV === "development") {
      console.info(`[email to ${email.to}] ${email.subject}\n${email.text}`);
    }
    return;
  }
  const res = await fetchFn(RESEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [email.to],
      subject: email.subject,
      text: email.text,
      html: email.html,
    }),
  });
  if (!res.ok) throw new Error(`Resend rejected the email with status ${res.status}`);
}
