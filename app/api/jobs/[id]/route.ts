import { NextRequest, NextResponse } from 'next/server';
import { getJobForUser, deleteJobForUser } from '@/lib/job-manager';
import { JobStatusResponse } from '@/lib/types';
import { requireAuth, forbiddenResponse } from '@/lib/auth-middleware';
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    // Pass token to use authenticated client - this ensures we use the correct user ID from the auth token
    const job = await getJobForUser(id, undefined, token || undefined);

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    const response: JobStatusResponse = {
      id: job.id,
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
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching job:', error);
    return NextResponse.json(
      { error: 'Failed to fetch job' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    // Pass token to use authenticated client - this ensures we use the correct user ID from the auth token
    const deleted = await deleteJobForUser(id, undefined, token || undefined);
    
    if (!deleted) {
      return NextResponse.json(
        { error: 'Job not found or you do not have permission to delete it' },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: 'Job deleted successfully' });
  } catch (error) {
    console.error('Error deleting job:', error);
    return NextResponse.json(
      { error: 'Failed to delete job' },
      { status: 500 }
    );
  }
}
