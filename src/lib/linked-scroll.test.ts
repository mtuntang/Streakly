import { describe, it, expect } from "bun:test";
import { mapScroll } from "./linked-scroll";

// Item centres on two rows: a wheel of 50px slots and a deck of 300px cards.
const wheel = [0, 50, 100, 150];
const deck = [0, 300, 600, 900];

describe("mapScroll", () => {
  it("maps an item's centre to the same item on the other row", () => {
    expect(mapScroll(wheel, deck, 100)).toBe(600);
    expect(mapScroll(deck, wheel, 300)).toBe(50);
  });

  it("maps a position between two items proportionally", () => {
    expect(mapScroll(wheel, deck, 75)).toBe(450);
    expect(mapScroll(deck, wheel, 450)).toBe(75);
  });

  it("clamps before the first and after the last item", () => {
    expect(mapScroll(wheel, deck, -20)).toBe(0);
    expect(mapScroll(wheel, deck, 999)).toBe(900);
  });

  it("matches by index when the rows differ in length", () => {
    expect(mapScroll(wheel, [0, 300], 150)).toBe(300);
  });

  it("handles a single item and empty rows", () => {
    expect(mapScroll([40], [10], 500)).toBe(10);
    expect(mapScroll([], [], 100)).toBe(0);
  });

  it("does not divide by zero when two items share a centre", () => {
    // Clamped ends: the last two cards both centre at the deck's max scroll.
    expect(mapScroll([0, 900, 900], wheel.slice(0, 3), 900)).toBe(50);
  });
});
