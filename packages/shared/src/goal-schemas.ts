import { z } from "zod";
import { GOAL_COLORS } from "./goal-config";
import { ScheduleSchema } from "./schedule";

const colorKeys = GOAL_COLORS.map((c) => c.key) as [string, ...string[]];

/** Contract for creating a goal — same schema validates the web form and the API edge. */
export const CreateGoalSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  description: z.string().trim().max(280).optional().nullable(),
  color: z.enum(colorKeys).optional(),
  icon: z.string().optional(),
  schedule: ScheduleSchema.optional().nullable(),
});

/** Contract for updating a goal — every field optional. */
export const UpdateGoalSchema = CreateGoalSchema.partial();

/** Contract for check-in requests — date optional, defaults to today server-side. */
export const CheckInBodySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
    .optional(),
});

export type CreateGoalInput = z.infer<typeof CreateGoalSchema>;
export type UpdateGoalInput = z.infer<typeof UpdateGoalSchema>;
