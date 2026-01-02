import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { createReadStream } from 'fs';
import { getJobForUser } from '@/lib/job-manager';
import { fileExists } from '@/lib/utils';
import { requireAuth } from '@/lib/auth-middleware';
import { isBunnyCdnUrl } from '@/lib/bunny-storage';

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

    // Get job with ownership verification - pass token to use authenticated client
    // This ensures we use the correct user ID from the auth token
    const job = await getJobForUser(id, undefined, token || undefined);

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
      filename = `tts_audio_${job.id}.wav`;
    } else {
      filePath = job.files.mergedAudio;
      filename = `merged_audio_${job.id}.flac`;
    }

    if (!filePath) {
      console.log(`[DOWNLOAD] Error: File path not set`);
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    // If it's a CDN URL, redirect to it
    if (isBunnyCdnUrl(filePath)) {
      const duration = Date.now() - startTime;
      console.log(`[DOWNLOAD] Redirecting to CDN: ${filePath} (${duration}ms)`);
      return NextResponse.redirect(filePath);
    }

    // Fall back to local file serving
    if (!(await fileExists(filePath))) {
      console.log(`[DOWNLOAD] Error: File not found at ${filePath}`);
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    // Stream file to avoid loading entire file into memory
    console.log(`[DOWNLOAD] Streaming file: ${filePath}`);
    const fileStream = createReadStream(filePath);
    
    // Get file size for Content-Length header (optional but helpful)
    const stats = await fs.stat(filePath);
    const fileSize = stats.size;
    
    // Return streaming response
    const duration = Date.now() - startTime;
    console.log(`[DOWNLOAD] Streaming ${fileSize} bytes in ${duration}ms`);
    // Determine content type based on file extension
    let contentType = 'audio/mpeg';
    if (filename.endsWith('.flac')) {
      contentType = 'audio/flac';
    } else if (filename.endsWith('.wav')) {
      contentType = 'audio/wav';
    }
    
    return new NextResponse(fileStream as any, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': fileSize.toString(),
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
