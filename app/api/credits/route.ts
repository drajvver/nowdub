import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-middleware';
import { getConvexClient, api } from '@/lib/convex-server-client';

const convex = getConvexClient();

export interface CreditResponse {
  balance: number | null;
  isInitialized: boolean;
  recentTransactions: {
    _id: string;
    userId: string;
    jobId?: string;
    amount: number;
    type: 'initial' | 'job_deduction' | 'admin_adjustment';
    description: string;
    createdAt: number;
  }[];
}

/**
 * GET /api/credits - Get user's credit balance and recent transactions
 */
export async function GET(request: NextRequest) {
  // Check authentication
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const { user } = authResult;

  try {
    // Get credits with history from Convex
    const creditsData = await convex.query(api.credits.getUserCreditsWithHistory, { 
      userId: user.id,
    });

    const response: CreditResponse = {
      balance: creditsData.balance,
      isInitialized: creditsData.isInitialized,
      recentTransactions: creditsData.recentTransactions.map((tx: any) => ({
        _id: tx._id,
        userId: tx.userId,
        jobId: tx.jobId,
        amount: tx.amount,
        type: tx.type,
        description: tx.description,
        createdAt: tx.createdAt,
      })),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching credits:', error);
    return NextResponse.json(
      { error: 'Failed to fetch credits' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/credits/initialize - Initialize user credits
 */
export async function POST(request: NextRequest) {
  // Check authentication
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const { user } = authResult;

  try {
    // Initialize credits (will return existing balance if already initialized)
    const balance = await convex.mutation(api.credits.initializeUserCredits, { 
      userId: user.id,
    });

    return NextResponse.json({ balance, initialized: true });
  } catch (error) {
    console.error('Error initializing credits:', error);
    return NextResponse.json(
      { error: 'Failed to initialize credits' },
      { status: 500 }
    );
  }
}

