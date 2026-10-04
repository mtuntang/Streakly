import { Hono } from "hono";
import { auth } from "../lib/auth";

// Better Auth's own router, mounted at /api/auth/* by index.ts.
// All endpoints (sign-up/sign-in/email-verification/session) are
// served by the library; this file is just the Hono binding.
export const authRoute = new Hono().on(["POST", "GET"], "/*", (c) =>
  auth.handler(c.req.raw),
);
