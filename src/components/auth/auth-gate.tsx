"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/session";

/**
 * Boot-time session check. Renders nothing meaningful until the session
 * is resolved: unauthenticated → redirect to /sign-in; authenticated →
 * render children. A transport/contract error is not "signed out", so
 * it shows a retry instead of bouncing the user to the login page.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = React.useState<"checking" | "ok" | "error">(
    "checking",
  );

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
  }, [router]);

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
          Could not reach the server.
        </p>
        <button
          className="underline"
          onClick={() => {
            setStatus("checking");
            // Re-run the same effect by remounting via key-less state churn.
            getSession()
              .then((session) => {
                if (session === null) router.replace("/sign-in");
                else setStatus("ok");
              })
              .catch(() => setStatus("error"));
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
