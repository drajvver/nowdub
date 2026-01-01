import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { getJobForUser } from '@/lib/job-manager';
import { fileExists } from '@/lib/utils';
import { requireAuth } from '@/lib/auth-middleware';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  console.log(`[DOWNLOAD] Download request for job ${id}`);
  const startTime = Date.now();
  
  // Check authentication
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) {
    console.log('[DOWNLOAD] Unauthorized request');
    return authResult;
  }
  const { user } = authResult;
  
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type');
    console.log(`[DOWNLOAD] Type: ${type}`);

    if (!type || (type !== 'tts' && type !== 'merged')) {
      console.log(`[DOWNLOAD] Error: Invalid type ${type}`);
      return NextResponse.json(
        { error: 'Invalid download type. Must be "tts" or "merged"' },
        { status: 400 }
      );
    }

    // Get job with ownership verification
    const job = await getJobForUser(id, user.id);

    if (!job) {
      console.log(`[DOWNLOAD] Error: Job not found or not owned by user`);
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    if (job.status !== 'completed') {
      console.log(`[DOWNLOAD] Error: Job not completed (status: ${job.status})`);
      return NextResponse.json(
        { error: 'Job is not completed yet' },
        { status: 400 }
      );
    }

    let filePath: string | undefined;
    let filename: string;

    if (type === 'tts') {
      filePath = job.files.ttsAudio;
      filename = `tts_audio_${job.id}.mp3`;
    } else {
      filePath = job.files.mergedAudio;
      filename = `merged_audio_${job.id}.mp3`;
    }

    if (!filePath || !(await fileExists(filePath))) {
      console.log(`[DOWNLOAD] Error: File not found at ${filePath}`);
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    // Read file
    console.log(`[DOWNLOAD] Reading file: ${filePath}`);
    const fileBuffer = await fs.readFile(filePath);

    // Return file with appropriate headers
    const duration = Date.now() - startTime;
    console.log(`[DOWNLOAD] Sending ${fileBuffer.length} bytes in ${duration}ms`);
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': fileBuffer.length.toString(),
      },
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[DOWNLOAD] Error after ${duration}ms:`, error);
    return NextResponse.json(
      { error: 'Failed to download file' },
      { status: 500 }
    );
  }
}
