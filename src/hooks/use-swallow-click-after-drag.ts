"use client";

import * as React from "react";

/**
 * Swallows the one click the browser fires when a drag ends.
 *
 * A drag ends with the pointer over the element it moved, so the browser
 * fires a click on whatever button sat under it. Without this, dropping a
 * goal card would check it in, and dropping a ribbon pill would jump to its
 * card. Pass the drag library's `isDragging` for the dragged element.
 */
export function useSwallowClickAfterDrag(isDragging: boolean) {
  React.useLayoutEffect(() => {
    if (!isDragging) return;
    return () => {
      const swallow = (e: MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
    };
  }, [isDragging]);
}
