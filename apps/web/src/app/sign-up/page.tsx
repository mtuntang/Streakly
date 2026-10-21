import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata = { title: "Sign up — Streakly" };

/** Sign-up page. */
export default function SignUpPage() {
  return (
    <AuthShell>
      <AuthForm mode="sign-up" />
    </AuthShell>
  );
}
