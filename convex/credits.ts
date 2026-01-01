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
      reservedCredits: 0,
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
 * Check if user has enough credits (considering reserved credits)
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

    // Calculate available balance (balance - reservedCredits)
    const reservedCredits = credits.reservedCredits ?? 0;
    const availableBalance = credits.balance - reservedCredits;
    return availableBalance >= args.amount;
  },
});

/**
 * Reserve credits for a job (pre-authorization)
 * This reserves credits from the user's balance before processing starts
 */
export const reserveCredits = mutation({
  args: {
    userId: v.optional(v.string()),
    amount: v.float64(),
    jobId: v.string(),
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

    // Calculate available balance (balance - reservedCredits)
    const reservedCredits = credits.reservedCredits ?? 0;
    const availableBalance = credits.balance - reservedCredits;

    if (availableBalance < args.amount) {
      throw new Error("Insufficient credits");
    }

    const now = Date.now();
    const newReservedCredits = reservedCredits + args.amount;

    // Update reserved credits
    await ctx.db.patch(credits._id, {
      reservedCredits: newReservedCredits,
      updatedAt: now,
    });

    // Log reservation transaction
    await ctx.db.insert("creditTransactions", {
      userId,
      jobId: args.jobId,
      amount: -args.amount, // Negative for reservation
      type: "reservation",
      description: args.description,
      createdAt: now,
    });

    return { balance: credits.balance, reservedCredits: newReservedCredits };
  },
});

/**
 * Finalize credits for a job (convert reservation to actual deduction or release)
 * This is called after job completion to either:
 * - Deduct actual credits used (if less than reserved, refund difference)
 * - Release all reserved credits (if job failed)
 */
export const finalizeCredits = mutation({
  args: {
    userId: v.optional(v.string()),
    jobId: v.string(),
    reservedAmount: v.float64(), // Amount that was reserved
    actualAmount: v.optional(v.float64()), // Actual credits used (if job succeeded)
    release: v.optional(v.boolean()), // If true, release all reserved credits (job failed)
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

    const reservedCredits = credits.reservedCredits ?? 0;
    
    // Verify that we have at least the reserved amount
    if (reservedCredits < args.reservedAmount) {
      console.warn(`[CREDITS] Reserved credits mismatch: expected ${args.reservedAmount}, found ${reservedCredits}`);
    }

    const now = Date.now();
    let newBalance = credits.balance;
    let newReservedCredits = Math.max(0, reservedCredits - args.reservedAmount);
    let transactionAmount = 0;
    let transactionType: "job_deduction" | "reservation_release" = "reservation_release";

    if (args.release) {
      // Job failed - release all reserved credits
      transactionAmount = 0; // No actual deduction, just release
      transactionType = "reservation_release";
    } else if (args.actualAmount !== undefined) {
      // Job succeeded - deduct actual amount used
      const actualAmount = args.actualAmount;
      transactionAmount = actualAmount;
      transactionType = "job_deduction";
      newBalance = credits.balance - actualAmount;
      
      // If actual amount is less than reserved, the difference is automatically released
      // (by reducing reservedCredits by the full reservedAmount)
    } else {
      // Default: deduct the reserved amount
      transactionAmount = args.reservedAmount;
      transactionType = "job_deduction";
      newBalance = credits.balance - args.reservedAmount;
    }

    // Update balance and reserved credits
    await ctx.db.patch(credits._id, {
      balance: newBalance,
      reservedCredits: newReservedCredits,
      updatedAt: now,
    });

    // Log transaction
    if (transactionAmount > 0) {
      await ctx.db.insert("creditTransactions", {
        userId,
        jobId: args.jobId,
        amount: -transactionAmount, // Negative for deduction
        type: transactionType,
        description: args.description,
        createdAt: now,
      });
    } else if (args.release) {
      // Log release transaction
      await ctx.db.insert("creditTransactions", {
        userId,
        jobId: args.jobId,
        amount: 0, // No amount change, just release
        type: "reservation_release",
        description: args.description,
        createdAt: now,
      });
    }

    return { balance: newBalance, reservedCredits: newReservedCredits };
  },
});

/**
 * Deduct credits from user's balance with transaction logging
 * Note: Prefer using reserveCredits + finalizeCredits for job processing
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
        reservedCredits: 0,
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
      reservedCredits: credits?.reservedCredits ?? 0,
      availableBalance: credits ? (credits.balance - (credits.reservedCredits ?? 0)) : null,
      isInitialized: credits !== null,
      recentTransactions,
    };
  },
});

