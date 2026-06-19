"use client";

import { Flame, Trophy, CalendarCheck, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { GoalDTO } from "@/lib/goal-config";

interface StatsBarProps {
  goals: GoalDTO[];
}

export function StatsBar({ goals }: StatsBarProps) {
  const total = goals.length;
  const doneToday = goals.filter((g) => g.stats.doneToday).length;
  const activeStreaks = goals.filter((g) => g.stats.active).length;
  const bestCurrent = goals.reduce((m, g) => Math.max(m, g.stats.current), 0);
  const longest = goals.reduce((m, g) => Math.max(m, g.stats.longest), 0);
  const totalCheckIns = goals.reduce((s, g) => s + g.stats.total, 0);

  const todayPct = total > 0 ? Math.round((doneToday / total) * 100) : 0;

  const items = [
    {
      label: "Done today",
      value: total > 0 ? `${doneToday}/${total}` : "0/0",
      sub: `${todayPct}% of goals`,
      icon: CheckCircle2,
      accent: "text-emerald-600 dark:text-emerald-400",
      progress: todayPct,
    },
    {
      label: "Active streaks",
      value: activeStreaks,
      sub: `${bestCurrent}d best current`,
      icon: Flame,
      accent: "text-orange-600 dark:text-orange-400",
    },
    {
      label: "Longest streak",
      value: `${longest}d`,
      sub: "personal record",
      icon: Trophy,
      accent: "text-amber-600 dark:text-amber-400",
    },
    {
      label: "Total check-ins",
      value: totalCheckIns,
      sub: "all time",
      icon: CalendarCheck,
      accent: "text-violet-600 dark:text-violet-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label} className="overflow-hidden">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground sm:text-sm">
                {item.label}
              </span>
              <item.icon className={`h-4 w-4 ${item.accent}`} />
            </div>
            <div className="mt-2 text-2xl font-bold tabular-nums sm:text-3xl">
              {item.value}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {item.sub}
            </div>
            {typeof item.progress === "number" && (
              <Progress value={item.progress} className="mt-3 h-1.5" />
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
