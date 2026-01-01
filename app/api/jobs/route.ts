import { NextRequest, NextResponse } from 'next/server';
import { getJobsByUser } from '@/lib/job-manager';
import { JobStatusResponse } from '@/lib/types';
import { requireAuth } from '@/lib/auth-middleware';

export async function GET(request: NextRequest) {
  // Check authentication
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }
  const { user } = authResult;

  try {
    // Get only jobs belonging to this user
    const jobs = getJobsByUser(user.id);
    
    const jobResponses: JobStatusResponse[] = jobs.map((job) => ({
      id: job.id,
      status: job.status,
      progress: job.progress,
      error: job.error,
      createdAt: job.createdAt.toISOString(),
      completedAt: job.completedAt?.toISOString(),
      downloads: job.files.ttsAudio || job.files.mergedAudio
        ? {
            ttsAudio: job.files.ttsAudio ? `/api/jobs/${job.id}/download?type=tts` : undefined,
            mergedAudio: job.files.mergedAudio ? `/api/jobs/${job.id}/download?type=merged` : undefined,
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
