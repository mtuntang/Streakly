import { AccountPage } from "@/components/auth/account-page";
import { AuthGate } from "@/components/auth/auth-gate";

export const metadata = { title: "Account — Streakly" };

/** Account page, behind the session check. */
export default function Account() {
  return (
    <AuthGate>
      <AccountPage />
    </AuthGate>
  );
}
