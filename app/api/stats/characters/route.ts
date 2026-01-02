import { NextRequest, NextResponse } from 'next/server';
import { getCharacterStats, getCharacterCountForPeriod } from '@/lib/influx-stats';

// Optional: API key for internal access (set STATS_API_KEY in environment)
const STATS_API_KEY = process.env.STATS_API_KEY;

/**
 * Simple API key authentication for internal endpoints
 */
function validateApiKey(request: NextRequest): boolean {
  // If no API key is configured, allow access (development mode)
  if (!STATS_API_KEY) {
    return true;
  }
  
  // Check for API key in header or query param
  const headerKey = request.headers.get('x-api-key');
  const queryKey = request.nextUrl.searchParams.get('api_key');
  
  return headerKey === STATS_API_KEY || queryKey === STATS_API_KEY;
}

export interface CharacterStatsResponse {
  totalCharacters: number;
  limit: number;
  usagePercent: number;
  remaining: number;
  periodDays: number;
  dailyBreakdown?: Array<{ date: string; characters: number }>;
}

/**
 * GET /api/stats/characters - Get TTS character usage statistics
 * 
 * Query params:
 * - days: Number of days to query (default: 30)
 * - breakdown: Include daily breakdown (default: false)
 * - api_key: Optional API key for authentication
 * 
 * Headers:
 * - x-api-key: Optional API key for authentication
 */
export async function GET(request: NextRequest) {
  // Validate API key if configured
  if (!validateApiKey(request)) {
    return NextResponse.json(
      { error: 'Unauthorized: Invalid or missing API key' },
      { status: 401 }
    );
  }

  try {
    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '30', 10);
    const includeBreakdown = searchParams.get('breakdown') === 'true';
    
    // Validate days parameter
    if (isNaN(days) || days < 1 || days > 365) {
      return NextResponse.json(
        { error: 'Invalid days parameter. Must be between 1 and 365.' },
        { status: 400 }
      );
    }

    // Get statistics from InfluxDB
    const stats = await getCharacterStats(days);
    
    const response: CharacterStatsResponse = {
      totalCharacters: stats.totalCharacters,
      limit: stats.limit,
      usagePercent: Math.round(stats.usagePercent * 100) / 100, // Round to 2 decimal places
      remaining: stats.remaining,
      periodDays: days,
    };
    
    // Include daily breakdown if requested
    if (includeBreakdown) {
      response.dailyBreakdown = stats.dailyBreakdown;
    }
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('[STATS] Error fetching character statistics:', error);
    
    // Check if InfluxDB is not configured
    if (error instanceof Error && error.message.includes('not configured')) {
      return NextResponse.json(
        { 
          error: 'Statistics not available',
          message: 'InfluxDB is not configured. Set INFLUX_URL and INFLUX_TOKEN environment variables.',
        },
        { status: 503 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch character statistics' },
      { status: 500 }
    );
  }
}

