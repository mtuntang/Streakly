import { AuthForm } from "@/components/auth/auth-form";

export const metadata = { title: "Sign in — Streakly" };

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <AuthForm mode="sign-in" />
    </main>
  );
}
