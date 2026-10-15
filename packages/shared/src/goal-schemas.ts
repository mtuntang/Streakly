import { z } from "zod";
import { GOAL_COLORS, GOAL_ICONS } from "./goal-config";
import { ScheduleSchema } from "./schedule";

const colorKeys = GOAL_COLORS.map((c) => c.key) as [string, ...string[]];
const iconKeys = GOAL_ICONS as [string, ...string[]];

/** Contract for creating a goal — same schema validates the web form and the API edge. */
export const CreateGoalSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  description: z.string().trim().max(280).optional().nullable(),
  color: z.enum(colorKeys).optional(),
  icon: z.enum(iconKeys).optional(),
  schedule: ScheduleSchema.optional().nullable(),
});

/** Contract for updating a goal — every field optional. */
export const UpdateGoalSchema = CreateGoalSchema.partial();

/**
 * A "YYYY-MM-DD" key for a day that exists on the calendar. The format check
 * alone lets 2026-02-31 through, and new Date() silently rolls it to March 3.
 */
export const DateKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
  .refine((key) => {
    const day = new Date(`${key}T00:00:00Z`);
    return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === key;
  }, "date must be a real calendar day");

/** Contract for check-in requests — date optional, defaults to today server-side. */
export const CheckInBodySchema = z.object({
  date: DateKeySchema.optional(),
});

export type CreateGoalInput = z.infer<typeof CreateGoalSchema>;
export type UpdateGoalInput = z.infer<typeof UpdateGoalSchema>;
