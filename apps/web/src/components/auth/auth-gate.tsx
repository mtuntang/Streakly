"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { getSession, syncTimeZone } from "@/lib/session";

type SessionUser = NonNullable<Awaited<ReturnType<typeof getSession>>>;

const SessionUserContext = React.createContext<SessionUser | null>(null);

/** The signed-in user. Only components rendered inside AuthGate can call it. */
export function useSessionUser(): SessionUser {
  const user = React.useContext(SessionUserContext);
  if (user === null) throw new Error("useSessionUser must be used inside AuthGate");
  return user;
}

/**
 * Checks the session before rendering its children: signed out redirects
 * to /sign-in, signed in renders the children with the user available
 * through useSessionUser(). A transport or contract
 * error is not "signed out", so it shows Retry instead of sending the user
 * to the login page.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = React.useState<"checking" | "ok" | "error">(
    "checking",
  );
  const [user, setUser] = React.useState<SessionUser | null>(null);
  // Bumped by Retry; as an effect dependency it re-runs the check.
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let alive = true;
    getSession()
      .then(async (session) => {
        if (!alive) return;
        if (session === null) {
          router.replace("/sign-in");
          return;
        }
        // Before the goals load, so their stats use this browser's day. A
        // failure only means the old zone stays for now; it is not a reason
        // to block the app.
        await syncTimeZone(session).catch(() => {});
        if (!alive) return;
        setUser(session);
        setStatus("ok");
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

  return <SessionUserContext.Provider value={user}>{children}</SessionUserContext.Provider>;
}
