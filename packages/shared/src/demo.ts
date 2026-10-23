import { toKey } from "./streaks";
import type { Schedule } from "./schedule";

/**
 * One demo goal and the shape of its history. Check-ins are generated, not
 * listed, so the cards show a believable 18-week heatmap:
 * - `days`: how far back the history goes (the goal's age).
 * - `rate`: the chance a scheduled day (or a weekly quota) was met, before
 *   the current streak.
 * - `streak`: the last N scheduled days before today are all done, and the
 *   scheduled day before them is missed, so the streak is exactly N.
 * - `today`: whether today is already checked in.
 */
export type DemoGoal = {
  name: string;
  description: string | null;
  color: string;
  icon: string;
  schedule: Schedule | null;
  days: number;
  rate: number;
  streak: number;
  today: boolean;
};

const WEEKS_18 = 126;

/**
 * The demo account's goals. The dev seed writes them to the database and
 * the signed-out demo page keeps them in memory, so both show the same
 * data. Together they cover every state a card can show: long and short
 * daily streaks, done and still due today, weekdays goals with rest days,
 * weekly quotas in progress, a broken streak, and a brand-new goal.
 */
export const DEMO_GOALS: DemoGoal[] = [
  { name: "Morning Workout", description: "30 minutes of movement to start the day.", color: "orange", icon: "Dumbbell", schedule: { type: "weekdays", days: [1, 2, 3, 4, 5] }, days: WEEKS_18, rate: 0.85, streak: 15, today: true },
  { name: "Drink 2L Water", description: "Stay hydrated all day.", color: "teal", icon: "Droplets", schedule: null, days: WEEKS_18, rate: 0.9, streak: 64, today: true },
  { name: "Read 20 Pages", description: "Feed the mind every night.", color: "violet", icon: "BookOpen", schedule: { type: "weekly", timesPerWeek: 4 }, days: WEEKS_18, rate: 0.9, streak: 0, today: false },
  { name: "Meditate", description: "10 minutes of calm.", color: "rose", icon: "Brain", schedule: null, days: 40, rate: 0.5, streak: 9, today: false },
  { name: "Walk 10k Steps", description: null, color: "emerald", icon: "Footprints", schedule: null, days: WEEKS_18, rate: 0.7, streak: 4, today: true },
  { name: "Learn French", description: "One lesson, every day.", color: "amber", icon: "Languages", schedule: null, days: 90, rate: 0.8, streak: 21, today: false },
  { name: "Journal", description: "Three lines before bed.", color: "pink", icon: "PencilLine", schedule: null, days: WEEKS_18, rate: 0.6, streak: 0, today: false },
  { name: "Lights Out by 11", description: null, color: "lime", icon: "Moon", schedule: null, days: 60, rate: 0.75, streak: 6, today: false },
  { name: "Cycle to Work", description: "Mon, Wed and Fri.", color: "emerald", icon: "Bike", schedule: { type: "weekdays", days: [1, 3, 5] }, days: WEEKS_18, rate: 0.8, streak: 8, today: false },
  { name: "Practice Guitar", description: "Scales first, then songs.", color: "amber", icon: "Music", schedule: { type: "weekly", timesPerWeek: 3 }, days: 70, rate: 0.8, streak: 0, today: true },
  { name: "No-Spend Day", description: null, color: "teal", icon: "PiggyBank", schedule: { type: "weekly", timesPerWeek: 5 }, days: 45, rate: 0.7, streak: 0, today: false },
  { name: "Water the Plants", description: "Sunday and Wednesday.", color: "lime", icon: "Sprout", schedule: { type: "weekdays", days: [0, 3] }, days: WEEKS_18, rate: 0.9, streak: 10, today: false },
  { name: "Stretch", description: "Just started this one.", color: "rose", icon: "Heart", schedule: null, days: 1, rate: 0, streak: 0, today: false },
];

/** A small seeded random generator, so the same goal always gets the same history. */
function random(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** The local day `n` days before `today`. */
function daysAgo(today: Date, n: number): Date {
  const d = new Date(today);
  d.setDate(today.getDate() - n);
  return d;
}

/** Returns when the demo goal was created: `days - 1` local days before `today`. */
export function demoCreatedAt(goal: DemoGoal, today: Date): Date {
  return daysAgo(today, goal.days - 1);
}

/** Returns the local days ("YYYY-MM-DD", oldest first) the demo goal was checked in. */
export function demoHistory(goal: DemoGoal, today: Date): string[] {
  const rng = random(goal.name);
  const done: Date[] = [];

  if (goal.schedule?.type === "weekly") {
    // Week by week (weeks start on Sunday). A met week fills its quota on
    // random days, a missed week falls one short. This week stops one short
    // of the quota, so the card shows quota progress.
    const quota = goal.schedule.timesPerWeek;
    const byWeek = new Map<string, Date[]>();
    for (let n = goal.days - 1; n >= 1; n--) {
      const d = daysAgo(today, n);
      const key = toKey(daysAgo(d, d.getDay()));
      byWeek.set(key, [...(byWeek.get(key) ?? []), d]);
    }
    const thisWeek = toKey(daysAgo(today, today.getDay()));
    for (const [key, week] of byWeek) {
      const current = key === thisWeek;
      const target = current
        ? quota - 1 - (goal.today ? 1 : 0)
        : rng() < goal.rate
          ? quota
          : quota - 1;
      const shuffled = [...week].sort(() => rng() - 0.5);
      done.push(...shuffled.slice(0, Math.max(0, Math.min(target, week.length))));
    }
  } else {
    const days = goal.schedule?.type === "weekdays" ? goal.schedule.days : [0, 1, 2, 3, 4, 5, 6];
    // Scheduled days before today, newest first.
    const scheduled: Date[] = [];
    for (let n = 1; n < goal.days; n++) {
      const d = daysAgo(today, n);
      if (days.includes(d.getDay())) scheduled.push(d);
    }
    scheduled.forEach((d, i) => {
      if (i < goal.streak) done.push(d);
      else if (i > goal.streak && rng() < goal.rate) done.push(d);
      // i === streak: the missed day just before the current streak.
    });
  }
  if (goal.today) done.push(new Date(today));
  return done.sort((a, b) => a.getTime() - b.getTime()).map(toKey);
}
