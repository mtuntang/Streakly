import { describe, expect, test } from "bun:test";
import { plural } from "./plural";

describe("plural", () => {
  test("keeps the word singular for exactly one", () => {
    expect(plural(1, "day")).toBe("day");
  });

  test("adds an s for zero and for more than one", () => {
    expect(plural(0, "check-in")).toBe("check-ins");
    expect(plural(2, "week")).toBe("weeks");
    expect(plural(35, "day")).toBe("days");
  });
});
