import { PrismaClient } from "@prisma/client";

export const db = new PrismaClient({
  // Only log queries in development to avoid leaking SQL in production
  log: process.env.NODE_ENV === "development" ? ["query"] : [],
});
