'use client';

import { useState, useEffect, useCallback } from 'react';
import { UserCredits } from './types';
import { useConvexAuthToken, createAuthFetchOptions } from './use-convex-auth-token';

export function useUserCredits() {
  const token = useConvexAuthToken();
  const [credits, setCredits] = useState<UserCredits | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCredits = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/credits', createAuthFetchOptions(token, {
        credentials: 'include',
      }));

      if (!response.ok) {
        throw new Error('Failed to fetch credits');
      }

      const data = await response.json();
      setCredits(data);
    } catch (err) {
      console.error('Error fetching credits:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const initializeCredits = useCallback(async () => {
    if (!token) return null;

    try {
      const response = await fetch('/api/credits', createAuthFetchOptions(token, {
        method: 'POST',
        credentials: 'include',
      }));

      if (!response.ok) {
        throw new Error('Failed to initialize credits');
      }

      const data = await response.json();
      // Refetch to get full data
      await fetchCredits();
      return data.balance;
    } catch (err) {
      console.error('Error initializing credits:', err);
      return null;
    }
  }, [token, fetchCredits]);

  // Fetch credits when token is available
  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  // Auto-initialize if not initialized
  useEffect(() => {
    if (!loading && credits && !credits.isInitialized) {
      initializeCredits();
    }
  }, [loading, credits, initializeCredits]);

  return {
    credits,
    balance: credits?.balance ?? null,
    isInitialized: credits?.isInitialized ?? false,
    transactions: credits?.recentTransactions ?? [],
    loading,
    error,
    refetch: fetchCredits,
    initializeCredits,
  };
}

// Credit cost constants (match the backend values)
export const CREDIT_COST_CACHE_MISS = 1.0;
export const CREDIT_COST_CACHE_HIT = 0.5;

/**
 * Calculate estimated credit cost based on line count
 * Returns min (all cache hits) and max (all cache misses)
 */
export function estimateCreditCost(lineCount: number) {
  return {
    minCredits: lineCount * CREDIT_COST_CACHE_HIT,  // Best case: all cached
    maxCredits: lineCount * CREDIT_COST_CACHE_MISS, // Worst case: all new
    lineCount,
  };
}

