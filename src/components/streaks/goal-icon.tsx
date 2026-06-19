"use client";

import * as React from "react";
import {
  Flame,
  Dumbbell,
  BookOpen,
  Droplets,
  Moon,
  Apple,
  Brain,
  Code2,
  PencilLine,
  Footprints,
  Heart,
  Music,
  Languages,
  PiggyBank,
  Sprout,
  Sunrise,
  Bike,
  Coffee,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  Flame,
  Dumbbell,
  BookOpen,
  Droplets,
  Moon,
  Apple,
  Brain,
  Code2,
  PencilLine,
  Footprints,
  Heart,
  Music,
  Languages,
  PiggyBank,
  Sprout,
  Sunrise,
  Bike,
  Coffee,
};

export function GoalIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const Icon = ICONS[name] ?? Flame;
  return <Icon className={className} />;
}

export const ICON_OPTIONS = Object.keys(ICONS);
