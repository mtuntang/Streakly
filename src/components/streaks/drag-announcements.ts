import type { Announcements, ScreenReaderInstructions } from "@dnd-kit/core";

/**
 * Returns what screen readers hear while a goal is dragged, using goal
 * names. The drag library's default announcements read out raw ids
 * ("Draggable item 815da3c1-… was dropped over droppable area …").
 */
export function goalDragAnnouncements(nameOf: (id: string) => string): Announcements {
  const name = (id: string | number) => nameOf(String(id));
  return {
    onDragStart: ({ active }) => `Picked up ${name(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over && over.id !== active.id ? `${name(active.id)} is over ${name(over.id)}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over && over.id !== active.id
        ? `Moved ${name(active.id)} to where ${name(over.id)} was.`
        : `${name(active.id)} was put back.`,
    onDragCancel: ({ active }) => `Moving ${name(active.id)} was cancelled.`,
  };
}

/** The hint screen readers attach to a draggable goal. */
export const GOAL_DRAG_INSTRUCTIONS: ScreenReaderInstructions = {
  draggable:
    "To reorder, press and hold, then drag. You can also use Move earlier and Move later in the goal's menu.",
};
