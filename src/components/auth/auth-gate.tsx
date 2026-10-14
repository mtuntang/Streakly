"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/session";

/**
 * Checks the session before rendering its children: signed out redirects
 * to /sign-in, signed in renders the children. A transport or contract
 * error is not "signed out", so it shows Retry instead of sending the user
 * to the login page.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = React.useState<"checking" | "ok" | "error">(
    "checking",
  );
  // Bumped by Retry; as an effect dependency it re-runs the check.
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let alive = true;
    getSession()
      .then((session) => {
        if (!alive) return;
        if (session === null) {
          router.replace("/sign-in");
        } else {
          setStatus("ok");
        }
      })
      .catch(() => {
        if (alive) setStatus("error");
      });
    return () => {
      alive = false;
    };
  }, [router, attempt]);

  if (status === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground" role="status">
          Checking session…
        </p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-sm text-muted-foreground">
          Could not check your session.
        </p>
        <button
          className="underline"
          onClick={() => {
            setStatus("checking");
            setAttempt((n) => n + 1);
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
