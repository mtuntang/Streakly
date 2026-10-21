"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MIN_PASSWORD_LENGTH } from "@streakly/shared";
import { AuthError, resetPassword } from "@/lib/session";
import { FormMessage, PasswordField } from "./form-fields";

/** Shown when the link is missing its token, has expired, or was already used. */
function ExpiredLink() {
  return (
    <div className="flex flex-col gap-5">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">This link has expired</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          Reset links work once and expire after 1 hour. Ask for a new one and
          use the newest email.
        </p>
      </div>
      <Button asChild className="h-11 w-full">
        <Link href="/forgot-password">Send a new link</Link>
      </Button>
      <Link
        href="/sign-in"
        className="mx-auto rounded-sm text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        Back to sign in
      </Link>
    </div>
  );
}

/**
 * Sets a new password from a reset link. The page passes the link's token,
 * or null when the server already found the link invalid. Saving signs out
 * every device, so success goes to sign-in with a confirmation.
 */
export function ResetPasswordForm({ token }: { token: string | null }) {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [expired, setExpired] = React.useState(token === null);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters for your new password.`);
      return;
    }
    setSubmitting(true);
    try {
      await resetPassword(token ?? "", password);
      router.replace("/sign-in?reset=done");
    } catch (err) {
      if (err instanceof AuthError && err.code === "INVALID_TOKEN") {
        setExpired(true);
      } else {
        setError("We couldn't save your new password. Check your connection and try again.");
      }
      setSubmitting(false);
    }
  }

  if (expired) return <ExpiredLink />;

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          You&apos;ll be signed out on every device, then you can sign in with
          the new password.
        </p>
      </div>

      {error ? (
        <FormMessage id="reset-error" tone="error">
          {error}
        </FormMessage>
      ) : null}

      <PasswordField
        id="new-password"
        label="New password"
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          if (error) setError(null);
        }}
        autoComplete="new-password"
        invalid={error !== null}
        errorId="reset-error"
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
      />

      <Button type="submit" disabled={submitting} className="h-11 w-full">
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Saving…
          </>
        ) : (
          "Save new password"
        )}
      </Button>
    </form>
  );
}
