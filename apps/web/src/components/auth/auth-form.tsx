"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MIN_PASSWORD_LENGTH } from "@streakly/shared";
import { getSession, signIn, signUp } from "@/lib/session";

/** Which field an error belongs to; "form" means the credentials as a whole. */
type ErrorTarget = "name" | "email" | "password" | "form";

/**
 * Renders the sign-in or sign-up form. The server owns the error contract,
 * so only its message is surfaced. The client pre-checks only what the
 * server would reject anyway on sign-up (password floor, blank name).
 * Sign-in sends whatever was typed: the floor governs new passwords, and
 * an account created under an older, lower floor must still sign in.
 * Errors stay in the form, next to what caused them, until the user edits
 * a field; a toast would vanish while they are still retyping. The form is
 * noValidate so the browser's own bubbles never replace that message.
 */
export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [name, setName] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<{ target: ErrorTarget; message: string } | null>(
    null,
  );

  const isSignUp = mode === "sign-up";

  // An already signed-in visitor has nothing to do here; errors are
  // ignored because the form itself still works without this check.
  React.useEffect(() => {
    let alive = true;
    getSession()
      .then((session) => {
        if (alive && session !== null) router.replace("/");
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [router]);

  /** Returns a change handler that also clears a shown error. */
  function edit(setter: (value: string) => void) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setter(e.target.value);
      if (error) setError(null);
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSignUp && name.trim() === "") {
      setError({ target: "name", message: "Enter your name." });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+$/.test(email.trim())) {
      setError({ target: "email", message: "Enter a valid email address." });
      return;
    }
    if (password === "") {
      setError({ target: "password", message: "Enter your password." });
      return;
    }
    if (isSignUp && password.length < MIN_PASSWORD_LENGTH) {
      setError({
        target: "password",
        message: `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`,
      });
      return;
    }
    setSubmitting(true);
    try {
      if (isSignUp) {
        await signUp(email.trim(), password, name.trim());
      } else {
        await signIn(email.trim(), password);
      }
      // The response set the session cookie; navigating to / mounts a
      // fresh AuthGate, whose session check now passes.
      router.replace("/");
    } catch (err) {
      setError({
        target: "form",
        message: err instanceof Error ? err.message : "Something went wrong. Try again.",
      });
      setSubmitting(false);
    }
  }

  const invalid = (target: ErrorTarget) =>
    error !== null && (error.target === target || error.target === "form");
  const describedBy = (target: ErrorTarget, extra?: string) =>
    [invalid(target) ? "auth-error" : null, extra].filter(Boolean).join(" ") || undefined;

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          {isSignUp ? "Create your account" : "Welcome back"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isSignUp
            ? "Start a habit today and keep the streak going."
            : "Sign in to pick up your streaks where you left off."}
        </p>
      </div>

      {error ? (
        <div
          id="auth-error"
          role="alert"
          className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-700 dark:text-red-300"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{error.message}</span>
        </div>
      ) : null}

      {isSignUp && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={name}
            onChange={edit(setName)}
            autoComplete="name"
            className="h-11"
            aria-invalid={invalid("name") || undefined}
            aria-describedby={describedBy("name")}
            required
          />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={edit(setEmail)}
          autoComplete="email"
          className="h-11"
          aria-invalid={invalid("email") || undefined}
          aria-describedby={describedBy("email")}
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={edit(setPassword)}
            autoComplete={isSignUp ? "new-password" : "current-password"}
            minLength={isSignUp ? MIN_PASSWORD_LENGTH : undefined}
            className="h-11 pr-11"
            aria-invalid={invalid("password") || undefined}
            aria-describedby={describedBy("password", isSignUp ? "password-hint" : undefined)}
            required
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-1/2 right-1 size-9 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
        {isSignUp ? (
          <p id="password-hint" className="text-xs text-muted-foreground">
            At least {MIN_PASSWORD_LENGTH} characters.
          </p>
        ) : null}
      </div>

      <Button type="submit" disabled={submitting} className="h-11 w-full">
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {isSignUp ? "Creating account…" : "Signing in…"}
          </>
        ) : isSignUp ? (
          "Create account"
        ) : (
          "Sign in"
        )}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {isSignUp ? "Already have an account? " : "New to Streakly? "}
        <Link
          href={isSignUp ? "/sign-in" : "/sign-up"}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          {isSignUp ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}
