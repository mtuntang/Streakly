import { StreaksApp } from "@/components/streaks/streaks-app";

export const metadata = { title: "Demo — Streakly" };

/**
 * The demo: the app on the demo account's goals, kept in memory, open to
 * anyone without signing in. Nothing here reaches the api.
 */
export default function DemoPage() {
  return <StreaksApp demo />;
}
