import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { DubbingJob } from './types';

// In-memory job storage (can be upgraded to Redis/DB later)
const jobs = new Map<string, DubbingJob>();

// Maximum concurrent jobs
const MAX_CONCURRENT_JOBS = 3;

// Currently processing jobs count
let processingCount = 0;

// Job queue for pending jobs
const jobQueue: string[] = [];

/**
 * Create a new dubbing job
 */
export function createJob(subtitlePath: string, originalAudioPath: string, userId: string): DubbingJob {
  const job: DubbingJob = {
    id: uuidv4(),
    userId,
    status: 'pending',
    files: {
      subtitle: subtitlePath,
      originalAudio: originalAudioPath,
    },
    createdAt: new Date(),
  };

  jobs.set(job.id, job);
  jobQueue.push(job.id);

  console.log(`[JOB] Created new job ${job.id} for user ${userId}`);
  console.log(`[JOB] Subtitle: ${subtitlePath}`);
  console.log(`[JOB] Audio: ${originalAudioPath}`);
  console.log(`[JOB] Queue size: ${jobQueue.length}, Processing: ${processingCount}/${MAX_CONCURRENT_JOBS}`);

  // Try to process the job
  processNextJob();

  return job;
}

/**
 * Get a job by ID
 */
export function getJob(jobId: string): DubbingJob | undefined {
  return jobs.get(jobId);
}

/**
 * Get a job by ID and verify ownership
 */
export function getJobForUser(jobId: string, userId: string): DubbingJob | undefined {
  const job = jobs.get(jobId);
  if (job && job.userId === userId) {
    return job;
  }
  return undefined;
}

/**
 * Update job status
 */
export function updateJobStatus(
  jobId: string,
  status: DubbingJob['status'],
  progress?: number,
  error?: string
): void {
  const job = jobs.get(jobId);
  if (!job) return;

  const oldStatus = job.status;
  job.status = status;
  if (progress !== undefined) {
    job.progress = progress;
  }
  if (error !== undefined) {
    job.error = error;
  }

  console.log(`[JOB] ${jobId}: ${oldStatus} -> ${status}${progress !== undefined ? ` (${progress}%)` : ''}${error ? ` - Error: ${error}` : ''}`);

  if (status === 'completed' || status === 'failed') {
    job.completedAt = new Date();
    processingCount--;
    
    console.log(`[JOB] ${jobId}: Completed at ${job.completedAt.toISOString()}`);
    console.log(`[JOB] Queue size: ${jobQueue.length}, Processing: ${processingCount}/${MAX_CONCURRENT_JOBS}`);
    
    // Process next job in queue
    processNextJob();
  }
}

/**
 * Update job file paths
 */
export function updateJobFiles(
  jobId: string,
  files: Partial<DubbingJob['files']>
): void {
  const job = jobs.get(jobId);
  if (!job) return;

  job.files = { ...job.files, ...files };
}

/**
 * Get all jobs
 */
export function getAllJobs(): DubbingJob[] {
  return Array.from(jobs.values()).sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
}

/**
 * Get all jobs for a specific user
 */
export function getJobsByUser(userId: string): DubbingJob[] {
  return Array.from(jobs.values())
    .filter((job) => job.userId === userId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Delete a job and clean up files
 */
export async function deleteJob(jobId: string): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) return;

  // Clean up files
  const filesToDelete = [
    job.files.subtitle,
    job.files.originalAudio,
    job.files.ttsAudio,
    job.files.mergedAudio,
  ].filter(Boolean);

  for (const filePath of filesToDelete) {
    try {
      await fs.unlink(filePath as string);
    } catch (error) {
      // Ignore errors if file doesn't exist
      console.error(`Error deleting file ${filePath}:`, error);
    }
  }

  jobs.delete(jobId);
}

/**
 * Delete a job for a specific user (with ownership check)
 */
export async function deleteJobForUser(jobId: string, userId: string): Promise<boolean> {
  const job = jobs.get(jobId);
  if (!job || job.userId !== userId) {
    return false;
  }

  await deleteJob(jobId);
  return true;
}

/**
 * Clean up old completed jobs
 */
export async function cleanupOldJobs(maxAge: number = 3600000): Promise<void> {
  // maxAge in milliseconds (default: 1 hour)
  const now = Date.now();
  const jobsToDelete: string[] = [];

  for (const [jobId, job] of jobs.entries()) {
    const age = now - job.createdAt.getTime();
    
    // Delete jobs older than maxAge that are completed or failed
    if (age > maxAge && (job.status === 'completed' || job.status === 'failed')) {
      jobsToDelete.push(jobId);
    }
  }

  for (const jobId of jobsToDelete) {
    await deleteJob(jobId);
  }
}

/**
 * Process next job in queue
 */
function processNextJob(): void {
  if (processingCount >= MAX_CONCURRENT_JOBS) {
    return;
  }

  const jobId = jobQueue.shift();
  if (!jobId) {
    return;
  }

  const job = jobs.get(jobId);
  if (!job || job.status !== 'pending') {
    // Skip this job and process next
    processNextJob();
    return;
  }

  processingCount++;
  processJob(jobId);
}

/**
 * Process a single job
 */
async function processJob(jobId: string): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) return;

  console.log(`[JOB] ${jobId}: Starting processing...`);
  const startTime = Date.now();

  try {
    updateJobStatus(jobId, 'processing', 0);

    // Import modules dynamically to avoid circular dependencies
    const { parseSubtitleFile } = await import('./subtitle-parser');
    const { generateTTSWithTiming } = await import('./tts-generator');
    const { applySidechainCompression, convertToMP3 } = await import('./audio-processor');

    // Create output directory
    const outputDir = path.join(path.dirname(job.files.subtitle), 'output');
    await fs.mkdir(outputDir, { recursive: true });
    console.log(`[JOB] ${jobId}: Output directory: ${outputDir}`);

    // Read and parse subtitle file
    updateJobStatus(jobId, 'processing', 10);
    console.log(`[JOB] ${jobId}: Reading subtitle file: ${job.files.subtitle}`);
    const subtitleContent = await fs.readFile(job.files.subtitle, 'utf-8');
    const segments = parseSubtitleFile(subtitleContent);
    console.log(`[JOB] ${jobId}: Parsed ${segments.length} subtitle segments`);

    // Generate TTS audio with timing
    updateJobStatus(jobId, 'processing', 20);
    console.log(`[JOB] ${jobId}: Starting TTS generation for ${segments.length} segments...`);
    const ttsAudioPath = path.join(outputDir, 'tts_audio.mp3');
    await generateTTSWithTiming(
      segments,
      ttsAudioPath,
      undefined,
      (progress) => {
        updateJobStatus(jobId, 'processing', 20 + progress * 0.4); // 20-60%
      }
    );
    console.log(`[JOB] ${jobId}: TTS audio generated: ${ttsAudioPath}`);

    updateJobFiles(jobId, { ttsAudio: ttsAudioPath });

    // Convert original audio to MP3 if needed
    updateJobStatus(jobId, 'processing', 65);
    const originalAudioPath = job.files.originalAudio;
    const convertedAudioPath = path.join(outputDir, 'original_converted.mp3');
    
    if (!originalAudioPath.toLowerCase().endsWith('.mp3')) {
      console.log(`[JOB] ${jobId}: Converting audio to MP3: ${originalAudioPath}`);
      await convertToMP3(originalAudioPath, convertedAudioPath);
    } else {
      console.log(`[JOB] ${jobId}: Audio already MP3, copying: ${originalAudioPath}`);
      // Copy if already MP3
      await fs.copyFile(originalAudioPath, convertedAudioPath);
    }

    // Apply sidechain compression to merge audio
    updateJobStatus(jobId, 'processing', 75);
    console.log(`[JOB] ${jobId}: Applying sidechain compression...`);
    const mergedAudioPath = path.join(outputDir, 'merged_audio.mp3');
    await applySidechainCompression(
      convertedAudioPath,
      ttsAudioPath,
      mergedAudioPath
    );
    console.log(`[JOB] ${jobId}: Merged audio created: ${mergedAudioPath}`);

    updateJobFiles(jobId, { mergedAudio: mergedAudioPath });

    // Clean up converted audio
    try {
      // await fs.unlink(convertedAudioPath);
      console.log(`[JOB] ${jobId}: Cleaned up temporary audio: ${convertedAudioPath}`);
    } catch (error) {
      console.log(`[JOB] ${jobId}: No temporary audio to clean up`);
    }

    // Mark job as completed
    const duration = Date.now() - startTime;
    console.log(`[JOB] ${jobId}: Processing completed in ${duration}ms`);
    updateJobStatus(jobId, 'completed', 100);
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[JOB] ${jobId}: Error after ${duration}ms:`, error);
    updateJobStatus(
      jobId,
      'failed',
      undefined,
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

/**
 * Start periodic cleanup of old jobs
 */
export function startCleanupScheduler(interval: number = 300000): void {
  // interval in milliseconds (default: 5 minutes)
  setInterval(() => {
    cleanupOldJobs().catch((error) => {
      console.error('Error during job cleanup:', error);
    });
  }, interval);
}
