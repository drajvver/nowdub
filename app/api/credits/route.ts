import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-middleware';
import { getConvexClientWithAuth, api } from '@/lib/convex-server-client';

export interface CreditResponse {
  balance: number | null;
  reservedCredits: number;
  availableBalance: number | null;
  isInitialized: boolean;
  recentTransactions: {
    _id: string;
    userId: string;
    jobId?: string;
    amount: number;
    type: 'initial' | 'job_deduction' | 'admin_adjustment' | 'reservation' | 'reservation_release';
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
    // Get auth token from request (check Authorization header first, then cookies)
    let token: string | null = null;
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    } else {
      // Fallback: check cookies for Convex JWT
      const allCookies = request.cookies.getAll();
      for (const cookie of allCookies) {
        if (cookie.name.toLowerCase().includes('convex') && cookie.name.toLowerCase().includes('jwt')) {
          token = cookie.value;
          break;
        }
      }
      // Also try the specific cookie name
      if (!token) {
        token = request.cookies.get('__convexAuthJWT')?.value ?? null;
      }
    }
    
    if (!token) {
      return NextResponse.json(
        { error: 'Authentication token required' },
        { status: 401 }
      );
    }

    // Use authenticated Convex client - don't pass userId, let Convex get it from auth context
    // This ensures we use the correct user ID from the auth token, preventing duplicate credit records
    const convex = getConvexClientWithAuth(token);
    const creditsData = await convex.query(api.credits.getUserCreditsWithHistory, {});

    const response: CreditResponse = {
      balance: creditsData.balance,
      reservedCredits: creditsData.reservedCredits ?? 0,
      availableBalance: creditsData.availableBalance,
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
    // Get auth token from request (check Authorization header first, then cookies)
    let token: string | null = null;
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    } else {
      // Fallback: check cookies for Convex JWT
      const allCookies = request.cookies.getAll();
      for (const cookie of allCookies) {
        if (cookie.name.toLowerCase().includes('convex') && cookie.name.toLowerCase().includes('jwt')) {
          token = cookie.value;
          break;
        }
      }
      // Also try the specific cookie name
      if (!token) {
        token = request.cookies.get('__convexAuthJWT')?.value ?? null;
      }
    }
    
    if (!token) {
      return NextResponse.json(
        { error: 'Authentication token required' },
        { status: 401 }
      );
    }

    // Use authenticated Convex client - don't pass userId, let Convex get it from auth context
    // This ensures we use the correct user ID from the auth token, preventing duplicate credit records
    const convex = getConvexClientWithAuth(token);
    // Initialize credits (will return existing balance if already initialized)
    const balance = await convex.mutation(api.credits.initializeUserCredits, {});

    return NextResponse.json({ balance, initialized: true });
  } catch (error) {
    console.error('Error initializing credits:', error);
    return NextResponse.json(
      { error: 'Failed to initialize credits' },
      { status: 500 }
    );
  }
}

