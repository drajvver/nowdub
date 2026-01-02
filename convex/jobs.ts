import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Create a new dubbing job
 */
export const createJob = mutation({
  args: {
    userId: v.optional(v.string()),
    name: v.optional(v.string()),
    files: v.object({
      subtitle: v.string(),
      originalAudio: v.string(),
      ttsAudio: v.optional(v.string()),
      mergedAudio: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    // Get userId from auth context or from parameter (for server-side calls)
    let userId: string | undefined = args.userId;
    if (!userId) {
      userId = (await getAuthUserId(ctx)) ?? undefined;
    }
    if (!userId) {
      throw new Error("Unauthorized");
    }

    const jobId = await ctx.db.insert("jobs", {
      userId,
      name: args.name,
      status: "pending",
      files: args.files,
      createdAt: Date.now(),
    });

    return jobId;
  },
});

/**
 * Get a job by ID (with user ownership check)
 * For user-facing API calls - requires userId
 */
export const getJob = query({
  args: { 
    jobId: v.id("jobs"),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      return null;
    }

    // Get userId from auth context or from parameter (for server-side calls)
    let userId: string | undefined = args.userId;
    if (!userId) {
      userId = (await getAuthUserId(ctx)) ?? undefined;
    }
    
    // Require userId for security
    if (!userId) {
      throw new Error("Unauthorized");
    }

    // Verify ownership
    if (job.userId !== userId) {
      throw new Error("Forbidden: You do not own this job");
    }

    return job;
  },
});

/**
 * Get a job by ID without auth check (for internal system use only)
 * This should only be called from server-side processing, not from API routes
 */
export const getJobById = query({
  args: { 
    jobId: v.id("jobs"),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    return job;
  },
});

/**
 * Get all jobs for the current user
 */
export const getUserJobs = query({
  args: {
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get userId from auth context or from parameter (for server-side calls)
    let userId: string | undefined = args.userId;
    if (!userId) {
      userId = (await getAuthUserId(ctx)) ?? undefined;
    }
    if (!userId) {
      throw new Error("Unauthorized");
    }

    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    return jobs;
  },
});

/**
 * Update job status
 */
export const updateJobStatus = mutation({
  args: {
    jobId: v.id("jobs"),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),
    progress: v.optional(v.number()),
    error: v.optional(v.string()),
    creditsUsed: v.optional(v.float64()),
    creditsReserved: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      throw new Error("Job not found");
    }

    const updateData: any = {
      status: args.status,
    };

    if (args.progress !== undefined) {
      updateData.progress = args.progress;
    }

    if (args.error !== undefined) {
      updateData.error = args.error;
    }

    if (args.creditsUsed !== undefined) {
      updateData.creditsUsed = args.creditsUsed;
    }

    if (args.creditsReserved !== undefined) {
      updateData.creditsReserved = args.creditsReserved;
    }

    if (args.status === "completed" || args.status === "failed") {
      updateData.completedAt = Date.now();
    }

    await ctx.db.patch(args.jobId, updateData);
  },
});

/**
 * Update job files
 */
export const updateJobFiles = mutation({
  args: {
    jobId: v.id("jobs"),
    files: v.object({
      subtitle: v.optional(v.string()),
      originalAudio: v.optional(v.string()),
      ttsAudio: v.optional(v.string()),
      mergedAudio: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      throw new Error("Job not found");
    }

    const updatedFiles = {
      ...job.files,
      ...Object.fromEntries(
        Object.entries(args.files).filter(([_, v]) => v !== undefined)
      ),
    };

    await ctx.db.patch(args.jobId, { files: updatedFiles });
  },
});

/**
 * Delete a job (with user ownership check)
 */
export const deleteJob = mutation({
  args: { 
    jobId: v.id("jobs"),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get userId from auth context or from parameter (for server-side calls)
    let userId: string | undefined = args.userId;
    if (!userId) {
      userId = (await getAuthUserId(ctx)) ?? undefined;
    }
    if (!userId) {
      throw new Error("Unauthorized");
    }

    const job = await ctx.db.get(args.jobId);
    if (!job) {
      throw new Error("Job not found");
    }

    // Verify ownership
    if (job.userId !== userId) {
      throw new Error("Forbidden: You do not own this job");
    }

    await ctx.db.delete(args.jobId);
    return { success: true, files: job.files };
  },
});

/**
 * Get pending jobs (for processing queue)
 * Note: This doesn't require auth as it's called by server-side processing
 */
export const getPendingJobs = query({
  args: {},
  handler: async (ctx) => {
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("desc")
      .collect();

    return jobs;
  },
});

/**
 * Clean up old completed/failed jobs
 * Should be called periodically by a cron job
 */
export const cleanupOldJobs = mutation({
  args: { maxAgeMs: v.number() },
  handler: async (ctx, args) => {
    const cutoffTime = Date.now() - args.maxAgeMs;
    
    const oldJobs = await ctx.db
      .query("jobs")
      .filter((q) =>
        q.and(
          q.or(
            q.eq(q.field("status"), "completed"),
            q.eq(q.field("status"), "failed")
          ),
          q.lt(q.field("createdAt"), cutoffTime)
        )
      )
      .collect();

    const deletedJobs = [];
    for (const job of oldJobs) {
      await ctx.db.delete(job._id);
      deletedJobs.push({ id: job._id, files: job.files });
    }

    return deletedJobs;
  },
});

