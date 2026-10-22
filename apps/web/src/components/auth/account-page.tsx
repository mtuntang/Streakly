"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { useSessionUser } from "./auth-gate";
import { ChangePasswordForm } from "./change-password-form";

/** The account page: who is signed in, and changing the password. */
export function AccountPage() {
  const user = useSessionUser();
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="app-header border-b border-border/70">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" aria-label="Streakly, back to your goals" className="rounded-md">
            <BrandMark />
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-4 pt-6 pb-12 sm:px-6 sm:pt-10">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Your goals
        </Link>

        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Account</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Signed in as <span className="font-medium text-foreground">{user.email}</span>
        </p>

        <section aria-labelledby="password-heading" className="mt-10 border-t border-border/70 pt-8">
          <h2 id="password-heading" className="text-lg font-semibold tracking-tight">
            Change password
          </h2>
          <p className="mt-1 mb-6 text-sm text-muted-foreground text-pretty">
            Forgot your current one? Sign out, then use &ldquo;Forgot
            password?&rdquo; on the sign-in page.
          </p>
          <ChangePasswordForm email={user.email} />
        </section>
      </main>
    </div>
  );
}
