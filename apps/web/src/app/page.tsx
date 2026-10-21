import { AuthGate } from "@/components/auth/auth-gate";
import { StreaksApp } from "@/components/streaks/streaks-app";

/** Home page: the app behind the session check. */
export default function Home() {
  return (
    <AuthGate>
      <StreaksApp />
    </AuthGate>
  );
}
