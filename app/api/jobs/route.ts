import { NextRequest, NextResponse } from 'next/server';
import { getJobsByUser } from '@/lib/job-manager';
import { JobStatusResponse } from '@/lib/types';
import { requireAuth } from '@/lib/auth-middleware';
import { isBunnyCdnUrl } from '@/lib/bunny-storage';

/**
 * Get the download URL for a file - returns CDN URL directly if available,
 * otherwise returns the API download endpoint
 */
function getDownloadUrl(filePath: string | undefined, jobId: string, type: 'tts' | 'merged'): string | undefined {
  if (!filePath) return undefined;
  // If it's a CDN URL, return it directly (no auth needed)
  if (isBunnyCdnUrl(filePath)) {
    return filePath;
  }
  // For local files, use the API download endpoint
  return `/api/jobs/${jobId}/download?type=${type}`;
}

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

    // Get only jobs belonging to this user - pass token to use authenticated client
    // This ensures we use the correct user ID from the auth token
    const jobs = await getJobsByUser(undefined, token || undefined);
    
    const jobResponses: JobStatusResponse[] = jobs.map((job) => ({
      id: job.id,
      name: job.name,
      status: job.status,
      progress: job.progress,
      error: job.error,
      createdAt: job.createdAt.toISOString(),
      completedAt: job.completedAt?.toISOString(),
      downloads: job.files.ttsAudio || job.files.mergedAudio
        ? {
            ttsAudio: getDownloadUrl(job.files.ttsAudio, job.id, 'tts'),
            mergedAudio: getDownloadUrl(job.files.mergedAudio, job.id, 'merged'),
          }
        : undefined,
    }));

    return NextResponse.json(jobResponses);
  } catch (error) {
    console.error('Error fetching jobs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch jobs' },
      { status: 500 }
    );
  }
}
