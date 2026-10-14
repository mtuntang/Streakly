"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { MIN_PASSWORD_LENGTH } from "@streakly/shared";
import { signIn, signUp } from "@/lib/session";

/**
 * Client form for both auth pages. The server owns the error contract —
 * only its message is surfaced, and the only client-side check is the
 * password floor, which avoids a guaranteed-rejected round-trip without
 * trying to re-implement Better Auth's validation.
 */
export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [name, setName] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const isSignUp = mode === "sign-up";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      toast({
        title: "Password too short",
        description: `Must be at least ${MIN_PASSWORD_LENGTH} characters.`,
        variant: "destructive",
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
      // Cookie is set by the response; a full navigation re-runs the
      // boot session check and lands in the app.
      router.replace("/");
      router.refresh();
    } catch (err) {
      toast({
        title: isSignUp ? "Sign-up failed" : "Sign-in failed",
        description:
          err instanceof Error ? err.message : "An unexpected error occurred.",
        variant: "destructive",
      });
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto flex w-full max-w-sm flex-col gap-4 rounded-lg border bg-card p-6"
    >
      <h1 className="text-xl font-semibold">
        {isSignUp ? "Create your account" : "Sign in to Streakly"}
      </h1>

      {isSignUp && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
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
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={isSignUp ? "new-password" : "current-password"}
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
      </div>

      <Button type="submit" disabled={submitting}>
        {submitting ? "Working…" : isSignUp ? "Create account" : "Sign in"}
      </Button>

      <p className="text-sm text-muted-foreground">
        {isSignUp ? (
          <>
            Already have an account?{" "}
            <Link href="/sign-in" className="underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            No account yet?{" "}
            <Link href="/sign-up" className="underline">
              Sign up
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
