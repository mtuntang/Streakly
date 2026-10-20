"use client";

import * as React from "react";

/**
 * Counts how many times `value` has changed since the component mounted,
 * counting only changes into a value that passes `counts`.
 *
 * Components use the count as a React key or a class switch to replay a
 * one-off animation (a check-in reward, a rolling number, the day-clear
 * ribbon). It is derived during render rather than in an effect, so the
 * change and its animation land in the same frame, and it starts at 0, so a
 * page load never plays every animation at once.
 */
export function useChangeCount<T>(
  value: T,
  counts: (next: T) => boolean = () => true,
): number {
  const [shown, setShown] = React.useState(value);
  const [count, setCount] = React.useState(0);
  if (!Object.is(value, shown)) {
    setShown(value);
    if (counts(value)) setCount(count + 1);
  }
  return count;
}
