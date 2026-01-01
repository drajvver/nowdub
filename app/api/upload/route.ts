import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { createJobTempDir, isSubtitleFile, isAudioFile, validateFileSize, generateUniqueFilename } from '@/lib/utils';
import { createJob } from '@/lib/job-manager';

// Maximum file size: 100MB
const MAX_FILE_SIZE = 100 * 1024 * 1024;

export async function POST(request: NextRequest) {
  console.log('[UPLOAD] Received upload request');
  const startTime = Date.now();
  
  try {
    const formData = await request.formData();
    
    const subtitleFile = formData.get('subtitle') as File;
    const audioFile = formData.get('audio') as File;

    console.log(`[UPLOAD] Subtitle file: ${subtitleFile?.name} (${subtitleFile?.size} bytes)`);
    console.log(`[UPLOAD] Audio file: ${audioFile?.name} (${audioFile?.size} bytes)`);

    // Validate files exist
    if (!subtitleFile) {
      console.log('[UPLOAD] Error: Subtitle file is required');
      return NextResponse.json(
        { error: 'Subtitle file is required' },
        { status: 400 }
      );
    }

    if (!audioFile) {
      console.log('[UPLOAD] Error: Audio file is required');
      return NextResponse.json(
        { error: 'Audio file is required' },
        { status: 400 }
      );
    }

    // Validate file types
    if (!isSubtitleFile(subtitleFile.name)) {
      console.log(`[UPLOAD] Error: Invalid subtitle format: ${subtitleFile.name}`);
      return NextResponse.json(
        { error: 'Subtitle file must be .srt or .vtt format' },
        { status: 400 }
      );
    }

    if (!isAudioFile(audioFile.name)) {
      console.log(`[UPLOAD] Error: Invalid audio format: ${audioFile.name}`);
      return NextResponse.json(
        { error: 'Audio file must be a valid audio format (mp3, wav, m4a, aac, ogg, flac, wma)' },
        { status: 400 }
      );
    }

    // Validate file sizes
    if (!validateFileSize(subtitleFile.size, MAX_FILE_SIZE)) {
      console.log(`[UPLOAD] Error: Subtitle file too large: ${subtitleFile.size} bytes`);
      return NextResponse.json(
        { error: `Subtitle file exceeds maximum size of ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    if (!validateFileSize(audioFile.size, MAX_FILE_SIZE)) {
      console.log(`[UPLOAD] Error: Audio file too large: ${audioFile.size} bytes`);
      return NextResponse.json(
        { error: `Audio file exceeds maximum size of ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // Create temporary directory for this upload
    const jobId = crypto.randomUUID();
    const tempDir = await createJobTempDir(jobId);
    console.log(`[UPLOAD] Created temp directory: ${tempDir}`);

    // Save subtitle file
    const subtitleFilename = generateUniqueFilename(subtitleFile.name);
    const subtitlePath = path.join(tempDir, subtitleFilename);
    const subtitleBuffer = Buffer.from(await subtitleFile.arrayBuffer());
    await fs.writeFile(subtitlePath, subtitleBuffer);
    console.log(`[UPLOAD] Saved subtitle: ${subtitlePath}`);

    // Save audio file
    const audioFilename = generateUniqueFilename(audioFile.name);
    const audioPath = path.join(tempDir, audioFilename);
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    await fs.writeFile(audioPath, audioBuffer);
    console.log(`[UPLOAD] Saved audio: ${audioPath}`);

    // Create job
    const job = createJob(subtitlePath, audioPath);

    const duration = Date.now() - startTime;
    console.log(`[UPLOAD] Upload completed in ${duration}ms, job ID: ${job.id}`);

    return NextResponse.json({
      jobId: job.id,
      message: 'Files uploaded successfully. Processing started.',
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[UPLOAD] Error after ${duration}ms:`, error);
    return NextResponse.json(
      { error: 'Failed to upload files' },
      { status: 500 }
    );
  }
}

