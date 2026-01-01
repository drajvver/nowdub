import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,
  // Users table is already included in authTables, but we can extend it
  // For now, we'll use the default user structure from @convex-dev/auth
  
  // Jobs table for dubbing jobs
  jobs: defineTable({
    userId: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),
    progress: v.optional(v.number()),
    error: v.optional(v.string()),
    files: v.object({
      subtitle: v.string(),
      originalAudio: v.string(),
      ttsAudio: v.optional(v.string()),
      mergedAudio: v.optional(v.string()),
    }),
    createdAt: v.number(), // timestamp
    completedAt: v.optional(v.number()), // timestamp
  })
    .index("by_user", ["userId"])
    .index("by_status", ["status"])
    .index("by_user_and_status", ["userId", "status"]),
});

