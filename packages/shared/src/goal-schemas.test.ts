import { describe, it, expect } from "bun:test";
import { CreateGoalSchema, UpdateGoalSchema } from "./goal-schemas";

describe("goal schemas", () => {
  it("a blank description is stored as null, not an empty string", () => {
    expect(CreateGoalSchema.parse({ name: "x", description: "   " }).description).toBeNull();
    expect(UpdateGoalSchema.parse({ description: "" }).description).toBeNull();
  });
  it("a real description is trimmed and kept", () => {
    expect(CreateGoalSchema.parse({ name: "x", description: "  run 5k " }).description).toBe("run 5k");
  });
  it("an omitted description stays omitted", () => {
    expect("description" in CreateGoalSchema.parse({ name: "x" })).toBe(false);
  });
});
