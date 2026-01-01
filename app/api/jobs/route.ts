import { NextRequest, NextResponse } from 'next/server';
import { getAllJobs } from '@/lib/job-manager';
import { JobStatusResponse } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const jobs = getAllJobs();
    
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

