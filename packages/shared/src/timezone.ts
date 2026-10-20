import { z } from "zod";
import { fromKey, toKey } from "./streaks";

/**
 * Returns whether a string names an IANA time zone this runtime knows,
 * such as "America/Los_Angeles". Offset strings like "+05:00" are rejected
 * even where Intl accepts them: a fixed offset has no DST rules, so a user
 * stored with one would see their day boundary drift by an hour twice a
 * year.
 */
export function isValidTimeZone(timeZone: string): boolean {
  if (!/^[A-Za-z]/.test(timeZone)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Contract for a stored user time zone. */
export const TimeZoneSchema = z
  .string()
  .max(64)
  .refine(isValidTimeZone, "timezone must be an IANA time zone");

/**
 * Returns the "YYYY-MM-DD" civil day it currently is in `timeZone`.
 * Without a zone, or with one this runtime does not know, it falls back to
 * the server's local day, which is what the app did before zones were
 * stored; that keeps users who signed up earlier working until their zone
 * is filled in.
 */
export function todayKeyIn(
  timeZone: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!timeZone || !isValidTimeZone(timeZone)) return toKey(now);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: "year" | "month" | "day") =>
    parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/**
 * Returns a Date to pass as `now` to the streak math so it runs on the
 * user's civil day. The streak math only reads the local calendar day of
 * `now`, so local midnight of the user's day is enough: no instant has to
 * be shifted between zones, and the result is the same on any server.
 */
export function zonedToday(
  timeZone: string | null | undefined,
  now: Date = new Date(),
): Date {
  return fromKey(todayKeyIn(timeZone, now));
}
