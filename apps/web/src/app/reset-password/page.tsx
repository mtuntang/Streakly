import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata = { title: "Choose a new password — Streakly" };

/**
 * Where the emailed reset link lands. The api redirects here with
 * ?token=… for a usable link, or ?error=INVALID_TOKEN for an expired or
 * used one.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  return (
    <AuthShell>
      <ResetPasswordForm token={token && !error ? token : null} />
    </AuthShell>
  );
}
