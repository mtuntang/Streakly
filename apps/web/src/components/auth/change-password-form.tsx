"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MIN_PASSWORD_LENGTH } from "@streakly/shared";
import { AuthError, changePassword } from "@/lib/session";
import { FormMessage, PasswordField } from "./form-fields";

type Field = "current" | "new";

/** Turns a refused change into a message and the field it belongs to. */
function changeError(err: unknown): { field: Field | null; message: string } {
  if (err instanceof AuthError) {
    if (err.code === "INVALID_PASSWORD") {
      return { field: "current", message: "That isn't your current password." };
    }
    if (err.status === 429) {
      return { field: null, message: "Too many attempts. Wait a minute, then try again." };
    }
  }
  return {
    field: null,
    message: "We couldn't change your password. Check your connection and try again.",
  };
}

/**
 * Changes the signed-in user's password. The current password proves it is
 * really them. Other devices are signed out; this one stays signed in, so
 * success clears the fields and confirms in place. `email` names the
 * account for password managers.
 */
export function ChangePasswordForm({ email }: { email: string }) {
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<{ field: Field | null; message: string } | null>(
    null,
  );

  function edit(setter: (value: string) => void) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setter(e.target.value);
      setError(null);
      setDone(false);
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (current === "") {
      setError({ field: "current", message: "Enter your current password." });
      return;
    }
    if (next.length < MIN_PASSWORD_LENGTH) {
      setError({
        field: "new",
        message: `Use at least ${MIN_PASSWORD_LENGTH} characters for your new password.`,
      });
      return;
    }
    setSubmitting(true);
    try {
      await changePassword(current, next);
      setCurrent("");
      setNext("");
      setDone(true);
    } catch (err) {
      setError(changeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  const invalid = (field: Field) => error !== null && error.field === field;

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {/* Lets password managers file the new password under this account. */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      {error ? (
        <FormMessage id="change-error" tone="error">
          {error.message}
        </FormMessage>
      ) : done ? (
        <FormMessage tone="success">
          Password changed. Any other devices were signed out.
        </FormMessage>
      ) : null}

      <PasswordField
        id="current-password"
        label="Current password"
        value={current}
        onChange={edit(setCurrent)}
        autoComplete="current-password"
        invalid={invalid("current")}
        errorId="change-error"
      />
      <PasswordField
        id="new-password"
        label="New password"
        value={next}
        onChange={edit(setNext)}
        autoComplete="new-password"
        invalid={invalid("new")}
        errorId="change-error"
        hint={`At least ${MIN_PASSWORD_LENGTH} characters. Other devices will be signed out.`}
      />

      <Button type="submit" disabled={submitting} className="h-11 w-full sm:w-fit sm:px-6">
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Changing password…
          </>
        ) : (
          "Change password"
        )}
      </Button>
    </form>
  );
}
