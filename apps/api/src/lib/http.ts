import type { Context } from "hono";
import type { z } from "zod";

/** An error with an HTTP status that the error handler returns verbatim. */
export class HttpError extends Error {
  constructor(
    public readonly status: 400 | 404 | 500,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string) => new HttpError(400, message);
export const notFound = (message = "Goal not found") => new HttpError(404, message);

/**
 * Reads and validates the request body against a zod schema.
 * Throws HttpError(400) with the first issue's message on any failure —
 * handlers just `const input = await parseBody(c, SomeSchema)`.
 */
export async function parseBody<S extends z.ZodTypeAny>(
  c: Context,
  schema: S,
): Promise<z.infer<S>> {
  const json = await c.req.json().catch(() => null);
  if (json === null || typeof json !== "object") {
    throw badRequest("Invalid JSON body");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "Invalid request");
  }
  return parsed.data;
}
