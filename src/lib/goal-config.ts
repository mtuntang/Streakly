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
  gradient: string;
  cellOn: string;
}

// Note: intentionally avoiding indigo/blue per project guidelines.
export const GOAL_COLORS: ColorConfig[] = [
  {
    key: "emerald",
    label: "Emerald",
    text: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-600",
    bgSoft: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    ring: "ring-emerald-500/40",
    dot: "bg-emerald-500",
    gradient: "from-emerald-500/20 to-emerald-500/0",
    cellOn: "bg-emerald-500",
  },
  {
    key: "rose",
    label: "Rose",
    text: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-600",
    bgSoft: "bg-rose-500/10",
    border: "border-rose-500/30",
    ring: "ring-rose-500/40",
    dot: "bg-rose-500",
    gradient: "from-rose-500/20 to-rose-500/0",
    cellOn: "bg-rose-500",
  },
  {
    key: "amber",
    label: "Amber",
    text: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500",
    bgSoft: "bg-amber-500/10",
    border: "border-amber-500/30",
    ring: "ring-amber-500/40",
    dot: "bg-amber-500",
    gradient: "from-amber-500/20 to-amber-500/0",
    cellOn: "bg-amber-500",
  },
  {
    key: "orange",
    label: "Orange",
    text: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-500",
    bgSoft: "bg-orange-500/10",
    border: "border-orange-500/30",
    ring: "ring-orange-500/40",
    dot: "bg-orange-500",
    gradient: "from-orange-500/20 to-orange-500/0",
    cellOn: "bg-orange-500",
  },
  {
    key: "teal",
    label: "Teal",
    text: "text-teal-600 dark:text-teal-400",
    bg: "bg-teal-500",
    bgSoft: "bg-teal-500/10",
    border: "border-teal-500/30",
    ring: "ring-teal-500/40",
    dot: "bg-teal-500",
    gradient: "from-teal-500/20 to-teal-500/0",
    cellOn: "bg-teal-500",
  },
  {
    key: "violet",
    label: "Violet",
    text: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-500",
    bgSoft: "bg-violet-500/10",
    border: "border-violet-500/30",
    ring: "ring-violet-500/40",
    dot: "bg-violet-500",
    gradient: "from-violet-500/20 to-violet-500/0",
    cellOn: "bg-violet-500",
  },
  {
    key: "pink",
    label: "Pink",
    text: "text-pink-600 dark:text-pink-400",
    bg: "bg-pink-500",
    bgSoft: "bg-pink-500/10",
    border: "border-pink-500/30",
    ring: "ring-pink-500/40",
    dot: "bg-pink-500",
    gradient: "from-pink-500/20 to-pink-500/0",
    cellOn: "bg-pink-500",
  },
  {
    key: "lime",
    label: "Lime",
    text: "text-lime-600 dark:text-lime-400",
    bg: "bg-lime-600",
    bgSoft: "bg-lime-500/10",
    border: "border-lime-500/30",
    ring: "ring-lime-500/40",
    dot: "bg-lime-500",
    gradient: "from-lime-500/20 to-lime-500/0",
    cellOn: "bg-lime-500",
  },
];

export const COLOR_MAP: Record<string, ColorConfig> = Object.fromEntries(
  GOAL_COLORS.map((c) => [c.key, c]),
);

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

export type GoalDTO = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  createdAt: string;
  updatedAt: string;
  checkIns: { date: string }[];
  stats: {
    current: number;
    longest: number;
    total: number;
    doneToday: boolean;
    active: boolean;
  };
};
