import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// Initial credits granted to new users
const INITIAL_CREDITS = 100;

/**
 * Initialize user credits on first access
 * Returns the current balance (creates record with initial credits if none exists)
 */
export const initializeUserCredits = mutation({
  args: {
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get userId from auth context or from parameter (for server-side calls)
    let userId = args.userId;
    if (!userId) {
      userId = await getAuthUserId(ctx);
    }
    if (!userId) {
      throw new Error("Unauthorized");
    }

    // Check if user already has credits
    const existing = await ctx.db
      .query("userCredits")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (existing) {
      return existing.balance;
    }

    // Create initial credits
    const now = Date.now();
    await ctx.db.insert("userCredits", {
      userId,
      balance: INITIAL_CREDITS,
      updatedAt: now,
    });

    // Log the initial credit transaction
    await ctx.db.insert("creditTransactions", {
      userId,
      amount: INITIAL_CREDITS,
      type: "initial",
      description: "Initial credits granted",
      createdAt: now,
    });

    return INITIAL_CREDITS;
  },
});

/**
 * Get user's current credit balance
 */
export const getUserCredits = query({
  args: {
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get userId from auth context or from parameter (for server-side calls)
    let userId = args.userId;
    if (!userId) {
      userId = await getAuthUserId(ctx);
    }
    if (!userId) {
      throw new Error("Unauthorized");
    }

    const credits = await ctx.db
      .query("userCredits")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    return credits?.balance ?? null;
  },
});

/**
 * Check if user has enough credits
 */
export const hasEnoughCredits = query({
  args: {
    userId: v.optional(v.string()),
    amount: v.float64(),
  },
  handler: async (ctx, args) => {
    // Get userId from auth context or from parameter (for server-side calls)
    let userId = args.userId;
    if (!userId) {
      userId = await getAuthUserId(ctx);
    }
    if (!userId) {
      throw new Error("Unauthorized");
    }

    const credits = await ctx.db
      .query("userCredits")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (!credits) {
      // User doesn't have credit record yet - they get initial credits
      return INITIAL_CREDITS >= args.amount;
    }

    return credits.balance >= args.amount;
  },
});

/**
 * Deduct credits from user's balance with transaction logging
 */
export const deductCredits = mutation({
  args: {
    userId: v.optional(v.string()),
    amount: v.float64(),
    jobId: v.optional(v.string()),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    // Get userId from auth context or from parameter (for server-side calls)
    let userId = args.userId;
    if (!userId) {
      userId = await getAuthUserId(ctx);
    }
    if (!userId) {
      throw new Error("Unauthorized");
    }

    const credits = await ctx.db
      .query("userCredits")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (!credits) {
      throw new Error("User credits not initialized");
    }

    if (credits.balance < args.amount) {
      throw new Error("Insufficient credits");
    }

    const now = Date.now();
    const newBalance = credits.balance - args.amount;

    // Update balance
    await ctx.db.patch(credits._id, {
      balance: newBalance,
      updatedAt: now,
    });

    // Log transaction
    await ctx.db.insert("creditTransactions", {
      userId,
      jobId: args.jobId,
      amount: -args.amount, // Negative for deductions
      type: "job_deduction",
      description: args.description,
      createdAt: now,
    });

    return newBalance;
  },
});

/**
 * Get transaction history for a user (paginated)
 */
export const getTransactionHistory = query({
  args: {
    userId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Get userId from auth context or from parameter (for server-side calls)
    let userId = args.userId;
    if (!userId) {
      userId = await getAuthUserId(ctx);
    }
    if (!userId) {
      throw new Error("Unauthorized");
    }

    const limit = args.limit ?? 20;

    const transactions = await ctx.db
      .query("creditTransactions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);

    return transactions;
  },
});

/**
 * Admin function to adjust credits (for manual adjustments)
 */
export const adminAdjustCredits = mutation({
  args: {
    userId: v.string(),
    amount: v.float64(),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    // Note: In production, add admin auth check here

    const credits = await ctx.db
      .query("userCredits")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    const now = Date.now();

    if (!credits) {
      // Create credit record
      await ctx.db.insert("userCredits", {
        userId: args.userId,
        balance: args.amount,
        updatedAt: now,
      });
    } else {
      // Update existing
      await ctx.db.patch(credits._id, {
        balance: credits.balance + args.amount,
        updatedAt: now,
      });
    }

    // Log transaction
    await ctx.db.insert("creditTransactions", {
      userId: args.userId,
      amount: args.amount,
      type: "admin_adjustment",
      description: args.description,
      createdAt: now,
    });

    return credits ? credits.balance + args.amount : args.amount;
  },
});

/**
 * Get user credits with recent transactions (for dashboard display)
 */
export const getUserCreditsWithHistory = query({
  args: {
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get userId from auth context or from parameter (for server-side calls)
    let userId = args.userId;
    if (!userId) {
      userId = await getAuthUserId(ctx);
    }
    if (!userId) {
      throw new Error("Unauthorized");
    }

    const credits = await ctx.db
      .query("userCredits")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    const recentTransactions = await ctx.db
      .query("creditTransactions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(10);

    return {
      balance: credits?.balance ?? null,
      isInitialized: credits !== null,
      recentTransactions,
    };
  },
});

