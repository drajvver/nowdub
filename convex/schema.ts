import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,
  // Users table is already included in authTables, but we can extend it
  // For now, we'll use the default user structure from @convex-dev/auth
});

