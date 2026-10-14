"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { MIN_PASSWORD_LENGTH } from "@streakly/shared";
import { getSession, signIn, signUp } from "@/lib/session";

/**
 * Client form for both auth pages. The server owns the error contract,
 * so only its message is surfaced. The client pre-checks only what the
 * server would reject anyway on sign-up (password floor, blank name).
 * Sign-in sends whatever was typed: the floor governs new passwords, and
 * an account created under an older, lower floor must still sign in.
 */
export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [name, setName] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSignUp && name.trim() === "") {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (isSignUp && password.length < MIN_PASSWORD_LENGTH) {
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
      // The response set the session cookie; navigating to / mounts a
      // fresh AuthGate, whose session check now passes.
      router.replace("/");
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
          minLength={isSignUp ? MIN_PASSWORD_LENGTH : undefined}
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
