"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthError, requestPasswordReset } from "@/lib/session";
import { FormMessage } from "./form-fields";

/** Turns a refused reset request into a sentence the user can act on. */
function requestErrorMessage(err: unknown): string {
  if (err instanceof AuthError && err.status === 429) {
    return "Too many reset requests. Wait a minute, then try again.";
  }
  return "We couldn't send the link. Check your connection and try again.";
}

/**
 * Asks for an email and sends a reset link to it. The server answers the
 * same for every address, so the confirmation never says whether an
 * account exists; it says where the link went if one does.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = React.useState("");
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const sentHeading = React.useRef<HTMLHeadingElement>(null);

  // The form, and the button that had focus, are gone once the link is
  // sent; focus moves to the confirmation so keyboard users aren't lost.
  React.useEffect(() => {
    if (sentTo) sentHeading.current?.focus();
  }, [sentTo]);

  async function send(address: string) {
    setSubmitting(true);
    setError(null);
    try {
      await requestPasswordReset(address);
      setSentTo(address);
    } catch (err) {
      setError(requestErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+$/.test(address)) {
      setError("Enter a valid email address.");
      return;
    }
    void send(address);
  }

  if (sentTo) {
    return (
      <div className="flex flex-col gap-5">
        <div className="space-y-1.5" role="status">
          <h1
            ref={sentHeading}
            tabIndex={-1}
            className="text-2xl font-semibold tracking-tight outline-none"
          >
            Check your email
          </h1>
          <p className="text-sm text-muted-foreground text-pretty">
            If an account uses <span className="font-medium text-foreground">{sentTo}</span>,
            a link to choose a new password is on its way. It works once and
            expires in 1 hour.
          </p>
        </div>
        {error ? <FormMessage tone="error">{error}</FormMessage> : null}
        <p className="text-sm text-muted-foreground text-pretty">
          Nothing after a few minutes? Check your spam folder, or{" "}
          <button
            type="button"
            onClick={() => void send(sentTo)}
            disabled={submitting}
            className="rounded-sm font-medium text-foreground underline underline-offset-4 disabled:opacity-60"
          >
            {submitting ? "sending…" : "send another link"}
          </button>
          .
        </p>
        <Button asChild variant="outline" className="h-11 w-full">
          <Link href="/sign-in">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          Enter the email you signed up with. We&apos;ll send you a link to
          choose a new password.
        </p>
      </div>

      {error ? (
        <FormMessage id="forgot-error" tone="error">
          {error}
        </FormMessage>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (error) setError(null);
          }}
          autoComplete="email"
          className="h-11"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "forgot-error" : undefined}
          required
        />
      </div>

      <Button type="submit" disabled={submitting} className="h-11 w-full">
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Sending link…
          </>
        ) : (
          "Send reset link"
        )}
      </Button>

      <Link
        href="/sign-in"
        className="mx-auto inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Back to sign in
      </Link>
    </form>
  );
}
