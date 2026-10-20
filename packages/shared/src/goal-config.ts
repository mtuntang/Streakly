// Shared configuration for goal colors and icons.
// Used by both API and UI so values stay in sync.

export interface ColorConfig {
  key: string;
  label: string;
  // Tailwind classes — kept static so the compiler can see them.
  text: string;
  bg: string;
  bgSoft: string;
  border: string;
  ring: string;
  dot: string;
  cellOn: string;
  /**
   * Background plus text color for a filled control that carries a label,
   * like a checked "Completed today" button. Mid-tone fills fail contrast
   * with white text, so light mode uses the 700 shade with white text and
   * dark mode uses the 400 shade with near-black text; both pass 4.5:1.
   */
  fill: string;
  /**
   * The checked check-in button: a light tint of the goal color with a
   * hairline edge and the 800 (light) or 200 (dark) shade as text, which
   * passes 4.5:1 on the card in both modes. It is deliberately quieter
   * than `action`: once a goal is done, the card stops asking for attention.
   */
  fillSoft: string;
  /**
   * The unchecked check-in button on a day it is due: card background, an
   * edge and label in the goal color. It marks what still needs doing.
   */
  action: string;
}

// Indigo and blue are left out on purpose, per the project's color guidelines.
export const GOAL_COLORS: ColorConfig[] = [
  {
    key: "emerald",
    label: "Emerald",
    text: "text-emerald-600 dark:text-goal-emerald",
    bg: "bg-emerald-600 dark:bg-goal-emerald",
    bgSoft: "bg-emerald-500/10 dark:bg-goal-emerald/12",
    border: "border-emerald-500/30",
    ring: "ring-emerald-500/40",
    dot: "bg-emerald-500 dark:bg-goal-emerald",
    cellOn: "bg-emerald-500 dark:bg-goal-emerald",
    fill: "bg-emerald-700 text-white dark:bg-goal-emerald dark:text-emerald-950",
    fillSoft: "bg-emerald-500/10 text-emerald-800 inset-ring inset-ring-emerald-600/20 hover:bg-emerald-500/15 dark:bg-goal-emerald/12 dark:text-emerald-200 dark:inset-ring-goal-emerald/22 dark:hover:bg-goal-emerald/18",
    action: "bg-card text-emerald-800 inset-ring-[1.5px] inset-ring-emerald-600/55 hover:bg-emerald-500/8 dark:bg-transparent dark:text-emerald-200 dark:inset-ring-goal-emerald/50 dark:hover:bg-goal-emerald/10",
  },
  {
    key: "rose",
    label: "Rose",
    text: "text-rose-600 dark:text-goal-rose",
    bg: "bg-rose-600 dark:bg-goal-rose",
    bgSoft: "bg-rose-500/10 dark:bg-goal-rose/12",
    border: "border-rose-500/30",
    ring: "ring-rose-500/40",
    dot: "bg-rose-500 dark:bg-goal-rose",
    cellOn: "bg-rose-500 dark:bg-goal-rose",
    fill: "bg-rose-700 text-white dark:bg-goal-rose dark:text-rose-950",
    fillSoft: "bg-rose-500/10 text-rose-800 inset-ring inset-ring-rose-600/20 hover:bg-rose-500/15 dark:bg-goal-rose/12 dark:text-rose-200 dark:inset-ring-goal-rose/22 dark:hover:bg-goal-rose/18",
    action: "bg-card text-rose-800 inset-ring-[1.5px] inset-ring-rose-600/55 hover:bg-rose-500/8 dark:bg-transparent dark:text-rose-200 dark:inset-ring-goal-rose/50 dark:hover:bg-goal-rose/10",
  },
  {
    key: "amber",
    label: "Amber",
    text: "text-amber-600 dark:text-goal-amber",
    bg: "bg-amber-500 dark:bg-goal-amber",
    bgSoft: "bg-amber-500/10 dark:bg-goal-amber/12",
    border: "border-amber-500/30",
    ring: "ring-amber-500/40",
    dot: "bg-amber-500 dark:bg-goal-amber",
    cellOn: "bg-amber-500 dark:bg-goal-amber",
    fill: "bg-amber-700 text-white dark:bg-goal-amber dark:text-amber-950",
    fillSoft: "bg-amber-500/10 text-amber-800 inset-ring inset-ring-amber-600/20 hover:bg-amber-500/15 dark:bg-goal-amber/12 dark:text-amber-200 dark:inset-ring-goal-amber/22 dark:hover:bg-goal-amber/18",
    action: "bg-card text-amber-800 inset-ring-[1.5px] inset-ring-amber-600/55 hover:bg-amber-500/8 dark:bg-transparent dark:text-amber-200 dark:inset-ring-goal-amber/50 dark:hover:bg-goal-amber/10",
  },
  {
    key: "orange",
    label: "Orange",
    text: "text-orange-600 dark:text-goal-orange",
    bg: "bg-orange-500 dark:bg-goal-orange",
    bgSoft: "bg-orange-500/10 dark:bg-goal-orange/12",
    border: "border-orange-500/30",
    ring: "ring-orange-500/40",
    dot: "bg-orange-500 dark:bg-goal-orange",
    cellOn: "bg-orange-500 dark:bg-goal-orange",
    fill: "bg-orange-700 text-white dark:bg-goal-orange dark:text-orange-950",
    fillSoft: "bg-orange-500/10 text-orange-800 inset-ring inset-ring-orange-600/20 hover:bg-orange-500/15 dark:bg-goal-orange/12 dark:text-orange-200 dark:inset-ring-goal-orange/22 dark:hover:bg-goal-orange/18",
    action: "bg-card text-orange-800 inset-ring-[1.5px] inset-ring-orange-600/55 hover:bg-orange-500/8 dark:bg-transparent dark:text-orange-200 dark:inset-ring-goal-orange/50 dark:hover:bg-goal-orange/10",
  },
  {
    key: "teal",
    label: "Teal",
    text: "text-teal-600 dark:text-goal-teal",
    bg: "bg-teal-500 dark:bg-goal-teal",
    bgSoft: "bg-teal-500/10 dark:bg-goal-teal/12",
    border: "border-teal-500/30",
    ring: "ring-teal-500/40",
    dot: "bg-teal-500 dark:bg-goal-teal",
    cellOn: "bg-teal-500 dark:bg-goal-teal",
    fill: "bg-teal-700 text-white dark:bg-goal-teal dark:text-teal-950",
    fillSoft: "bg-teal-500/10 text-teal-800 inset-ring inset-ring-teal-600/20 hover:bg-teal-500/15 dark:bg-goal-teal/12 dark:text-teal-200 dark:inset-ring-goal-teal/22 dark:hover:bg-goal-teal/18",
    action: "bg-card text-teal-800 inset-ring-[1.5px] inset-ring-teal-600/55 hover:bg-teal-500/8 dark:bg-transparent dark:text-teal-200 dark:inset-ring-goal-teal/50 dark:hover:bg-goal-teal/10",
  },
  {
    key: "violet",
    label: "Violet",
    text: "text-violet-600 dark:text-goal-violet",
    bg: "bg-violet-500 dark:bg-goal-violet",
    bgSoft: "bg-violet-500/10 dark:bg-goal-violet/12",
    border: "border-violet-500/30",
    ring: "ring-violet-500/40",
    dot: "bg-violet-500 dark:bg-goal-violet",
    cellOn: "bg-violet-500 dark:bg-goal-violet",
    fill: "bg-violet-700 text-white dark:bg-goal-violet dark:text-violet-950",
    fillSoft: "bg-violet-500/10 text-violet-800 inset-ring inset-ring-violet-600/20 hover:bg-violet-500/15 dark:bg-goal-violet/12 dark:text-violet-200 dark:inset-ring-goal-violet/22 dark:hover:bg-goal-violet/18",
    action: "bg-card text-violet-800 inset-ring-[1.5px] inset-ring-violet-600/55 hover:bg-violet-500/8 dark:bg-transparent dark:text-violet-200 dark:inset-ring-goal-violet/50 dark:hover:bg-goal-violet/10",
  },
  {
    key: "pink",
    label: "Pink",
    text: "text-pink-600 dark:text-goal-pink",
    bg: "bg-pink-500 dark:bg-goal-pink",
    bgSoft: "bg-pink-500/10 dark:bg-goal-pink/12",
    border: "border-pink-500/30",
    ring: "ring-pink-500/40",
    dot: "bg-pink-500 dark:bg-goal-pink",
    cellOn: "bg-pink-500 dark:bg-goal-pink",
    fill: "bg-pink-700 text-white dark:bg-goal-pink dark:text-pink-950",
    fillSoft: "bg-pink-500/10 text-pink-800 inset-ring inset-ring-pink-600/20 hover:bg-pink-500/15 dark:bg-goal-pink/12 dark:text-pink-200 dark:inset-ring-goal-pink/22 dark:hover:bg-goal-pink/18",
    action: "bg-card text-pink-800 inset-ring-[1.5px] inset-ring-pink-600/55 hover:bg-pink-500/8 dark:bg-transparent dark:text-pink-200 dark:inset-ring-goal-pink/50 dark:hover:bg-goal-pink/10",
  },
  {
    key: "lime",
    label: "Lime",
    text: "text-lime-600 dark:text-goal-lime",
    bg: "bg-lime-600 dark:bg-goal-lime",
    bgSoft: "bg-lime-500/10 dark:bg-goal-lime/12",
    border: "border-lime-500/30",
    ring: "ring-lime-500/40",
    dot: "bg-lime-500 dark:bg-goal-lime",
    cellOn: "bg-lime-500 dark:bg-goal-lime",
    fill: "bg-lime-700 text-white dark:bg-goal-lime dark:text-lime-950",
    fillSoft: "bg-lime-500/10 text-lime-800 inset-ring inset-ring-lime-600/20 hover:bg-lime-500/15 dark:bg-goal-lime/12 dark:text-lime-200 dark:inset-ring-goal-lime/22 dark:hover:bg-goal-lime/18",
    action: "bg-card text-lime-800 inset-ring-[1.5px] inset-ring-lime-600/55 hover:bg-lime-500/8 dark:bg-transparent dark:text-lime-200 dark:inset-ring-goal-lime/50 dark:hover:bg-goal-lime/10",
  },
];

export const COLOR_MAP: Record<string, ColorConfig> = Object.fromEntries(
  GOAL_COLORS.map((c) => [c.key, c]),
);

/** Defaults applied when a create request omits color / icon. */
export const DEFAULT_COLOR = "emerald";
export const DEFAULT_ICON = "Flame";

/** Returns the color config for a key, falling back to the first color. */
export function getColor(key: string): ColorConfig {
  return COLOR_MAP[key] ?? GOAL_COLORS[0];
}

// A curated set of Lucide icon names users can pick from for a goal.
export const GOAL_ICONS: string[] = [
  "Flame",
  "Dumbbell",
  "BookOpen",
  "Droplets",
  "Moon",
  "Apple",
  "Brain",
  "Code2",
  "PencilLine",
  "Footprints",
  "Heart",
  "Music",
  "Languages",
  "PiggyBank",
  "Sprout",
  "Sunrise",
  "Bike",
  "Coffee",
];

import type { Schedule } from "./schedule";
import type { StreakStats } from "./streaks";

export type GoalDTO = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  schedule: Schedule | null;
  createdAt: string;
  updatedAt: string;
  checkIns: { date: string }[];
  stats: StreakStats;
};
