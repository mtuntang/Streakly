import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata = { title: "Sign in — Streakly" };

/** Sign-in page. After a password reset it confirms the new password is set. */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const { reset } = await searchParams;
  return (
    <AuthShell>
      <AuthForm
        mode="sign-in"
        notice={reset === "done" ? "Your password is changed. Sign in with the new one." : undefined}
      />
    </AuthShell>
  );
}
