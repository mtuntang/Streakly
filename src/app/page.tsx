import { AuthGate } from "@/components/auth/auth-gate";
import { StreaksApp } from "@/components/streaks/streaks-app";

export default function Home() {
  return (
    <AuthGate>
      <StreaksApp />
    </AuthGate>
  );
}
