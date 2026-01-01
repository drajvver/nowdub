import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/job-manager';
import { JobStatusResponse } from '@/lib/types';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const job = getJob(params.id);

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
            ttsAudio: job.files.ttsAudio ? `/api/jobs/${job.id}/download?type=tts` : undefined,
            mergedAudio: job.files.mergedAudio ? `/api/jobs/${job.id}/download?type=merged` : undefined,
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
  { params }: { params: { id: string } }
) {
  try {
    const { deleteJob } = await import('@/lib/job-manager');
    await deleteJob(params.id);

    return NextResponse.json({ message: 'Job deleted successfully' });
  } catch (error) {
    console.error('Error deleting job:', error);
    return NextResponse.json(
      { error: 'Failed to delete job' },
      { status: 500 }
    );
  }
}

