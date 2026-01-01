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
    creditsUsed: v.optional(v.float64()), // credits consumed by this job
  })
    .index("by_user", ["userId"])
    .index("by_status", ["status"])
    .index("by_user_and_status", ["userId", "status"]),

  // User credits balance
  userCredits: defineTable({
    userId: v.string(),
    balance: v.float64(), // current credit balance
    updatedAt: v.number(), // timestamp
  })
    .index("by_user", ["userId"]),

  // Credit transaction history
  creditTransactions: defineTable({
    userId: v.string(),
    jobId: v.optional(v.string()), // reference to job (optional for initial credits)
    amount: v.float64(), // positive for additions, negative for deductions
    type: v.union(
      v.literal("initial"),
      v.literal("job_deduction"),
      v.literal("admin_adjustment")
    ),
    description: v.string(),
    createdAt: v.number(), // timestamp
  })
    .index("by_user", ["userId"])
    .index("by_user_and_created", ["userId", "createdAt"]),
});

