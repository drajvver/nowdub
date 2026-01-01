import { promises as fs } from 'fs';
import path from 'path';
import { DubbingJob } from './types';
import { getConvexClient, api } from './convex-server-client';
import { Id } from '../convex/_generated/dataModel';

// Maximum concurrent jobs
const MAX_CONCURRENT_JOBS = 3;

// Currently processing jobs count
let processingCount = 0;

// Job queue for pending jobs
const jobQueue: Id<"jobs">[] = [];

// Get Convex client
const convex = getConvexClient();

/**
 * Convert Convex job to DubbingJob type
 */
function convertConvexJobToDubbingJob(job: any, jobId: Id<"jobs">): DubbingJob {
  return {
    id: jobId,
    userId: job.userId,
    status: job.status,
    progress: job.progress,
    error: job.error,
    files: job.files,
    createdAt: new Date(job.createdAt),
    completedAt: job.completedAt ? new Date(job.completedAt) : undefined,
  };
}

/**
 * Create a new dubbing job
 */
export async function createJob(subtitlePath: string, originalAudioPath: string, userId: string): Promise<DubbingJob> {
  const jobId = await convex.mutation(api.jobs.createJob, {
    userId,
    files: {
      subtitle: subtitlePath,
      originalAudio: originalAudioPath,
    },
  });

  console.log(`[JOB] Created new job ${jobId} for user ${userId}`);
  console.log(`[JOB] Subtitle: ${subtitlePath}`);
  console.log(`[JOB] Audio: ${originalAudioPath}`);
  console.log(`[JOB] Queue size: ${jobQueue.length}, Processing: ${processingCount}/${MAX_CONCURRENT_JOBS}`);

  // Add to queue and try to process
  jobQueue.push(jobId);
  processNextJob();

  // Fetch and return the created job
  const job = await convex.query(api.jobs.getJob, { jobId, userId });
  if (!job) {
    throw new Error('Failed to create job');
  }

  return convertConvexJobToDubbingJob(job, jobId);
}

/**
 * Get a job by ID
 */
export async function getJob(jobId: string): Promise<DubbingJob | undefined> {
  try {
    // Note: This should only be called internally, not for user-facing operations
    const job = await convex.query(api.jobs.getJob, { 
      jobId: jobId as Id<"jobs">,
      userId: undefined, // Will fail if called without userId - use getJobForUser instead
    });
    if (!job) return undefined;
    return convertConvexJobToDubbingJob(job, jobId as Id<"jobs">);
  } catch (error) {
    console.error(`[JOB] Error getting job ${jobId}:`, error);
    return undefined;
  }
}

/**
 * Get a job by ID and verify ownership
 */
export async function getJobForUser(jobId: string, userId: string): Promise<DubbingJob | undefined> {
  try {
    const job = await convex.query(api.jobs.getJob, { 
      jobId: jobId as Id<"jobs">,
      userId,
    });
    if (!job) {
      return undefined;
    }
    return convertConvexJobToDubbingJob(job, jobId as Id<"jobs">);
  } catch (error) {
    console.error(`[JOB] Error getting job ${jobId} for user ${userId}:`, error);
    return undefined;
  }
}

/**
 * Update job status
 */
export async function updateJobStatus(
  jobId: string,
  status: DubbingJob['status'],
  progress?: number,
  error?: string
): Promise<void> {
  try {
    // Just update the status directly without fetching the old job
    // The Convex mutation will handle validation
    await convex.mutation(api.jobs.updateJobStatus, {
      jobId: jobId as Id<"jobs">,
      status,
      progress,
      error,
    });

    console.log(`[JOB] ${jobId}: -> ${status}${progress !== undefined ? ` (${progress}%)` : ''}${error ? ` - Error: ${error}` : ''}`);

    if (status === 'completed' || status === 'failed') {
      processingCount--;
      
      console.log(`[JOB] ${jobId}: Completed`);
      console.log(`[JOB] Queue size: ${jobQueue.length}, Processing: ${processingCount}/${MAX_CONCURRENT_JOBS}`);
      
      // Process next job in queue
      processNextJob();
    }
  } catch (error) {
    console.error(`[JOB] Error updating job status for ${jobId}:`, error);
  }
}

/**
 * Update job file paths
 */
export async function updateJobFiles(
  jobId: string,
  files: Partial<DubbingJob['files']>
): Promise<void> {
  try {
    await convex.mutation(api.jobs.updateJobFiles, {
      jobId: jobId as Id<"jobs">,
      files,
    });
  } catch (error) {
    console.error(`[JOB] Error updating job files for ${jobId}:`, error);
  }
}

/**
 * Get all jobs
 */
export async function getAllJobs(): Promise<DubbingJob[]> {
  try {
    // This shouldn't be used - kept for backward compatibility
    // Use getJobsByUser instead
    console.warn('[JOB] getAllJobs called - this should use getJobsByUser instead');
    return [];
  } catch (error) {
    console.error('[JOB] Error getting all jobs:', error);
    return [];
  }
}

/**
 * Get all jobs for a specific user
 */
export async function getJobsByUser(userId: string): Promise<DubbingJob[]> {
  try {
    const jobs = await convex.query(api.jobs.getUserJobs, { userId });
    return jobs.map((job: any) => convertConvexJobToDubbingJob(job, job._id));
  } catch (error) {
    console.error(`[JOB] Error getting jobs for user ${userId}:`, error);
    return [];
  }
}

/**
 * Delete a job and clean up files
 */
export async function deleteJob(jobId: string): Promise<void> {
  try {
    // This version doesn't verify ownership - should only be used for internal cleanup
    const result = await convex.mutation(api.jobs.deleteJob, { 
      jobId: jobId as Id<"jobs">,
      userId: undefined,
    });
    
    if (result.success && result.files) {
      // Clean up files
      const filesToDelete = [
        result.files.subtitle,
        result.files.originalAudio,
        result.files.ttsAudio,
        result.files.mergedAudio,
      ].filter(Boolean);

      for (const filePath of filesToDelete) {
        try {
          await fs.unlink(filePath as string);
        } catch (error) {
          // Ignore errors if file doesn't exist
          console.error(`Error deleting file ${filePath}:`, error);
        }
      }
    }
  } catch (error) {
    console.error(`[JOB] Error deleting job ${jobId}:`, error);
  }
}

/**
 * Delete a job for a specific user (with ownership check)
 */
export async function deleteJobForUser(jobId: string, userId: string): Promise<boolean> {
  try {
    const result = await convex.mutation(api.jobs.deleteJob, { 
      jobId: jobId as Id<"jobs">,
      userId,
    });

    if (result.success && result.files) {
      // Clean up files
      const filesToDelete = [
        result.files.subtitle,
        result.files.originalAudio,
        result.files.ttsAudio,
        result.files.mergedAudio,
      ].filter(Boolean);

      for (const filePath of filesToDelete) {
        try {
          await fs.unlink(filePath as string);
        } catch (error) {
          // Ignore errors if file doesn't exist
          console.error(`Error deleting file ${filePath}:`, error);
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error(`[JOB] Error deleting job ${jobId} for user ${userId}:`, error);
    return false;
  }
}

/**
 * Clean up old completed jobs
 */
export async function cleanupOldJobs(maxAge: number = 3600000): Promise<void> {
  try {
    const deletedJobs = await convex.mutation(api.jobs.cleanupOldJobs, { maxAgeMs: maxAge });
    
    // Clean up files for deleted jobs
    for (const { files } of deletedJobs) {
      const filesToDelete = [
        files.subtitle,
        files.originalAudio,
        files.ttsAudio,
        files.mergedAudio,
      ].filter(Boolean);

      for (const filePath of filesToDelete) {
        try {
          await fs.unlink(filePath as string);
        } catch (error) {
          // Ignore errors if file doesn't exist
          console.error(`Error deleting file ${filePath}:`, error);
        }
      }
    }
  } catch (error) {
    console.error('[JOB] Error cleaning up old jobs:', error);
  }
}

/**
 * Process next job in queue
 */
async function processNextJob(): Promise<void> {
  if (processingCount >= MAX_CONCURRENT_JOBS) {
    return;
  }

  const jobId = jobQueue.shift();
  if (!jobId) {
    return;
  }

  try {
    // For internal processing, we need to get the job without userId check
    // We'll use the getPendingJobs query to verify it's actually pending
    const pendingJobs = await convex.query(api.jobs.getPendingJobs, {});
    const job = pendingJobs.find((j: any) => j._id === jobId);
    
    if (!job) {
      // Skip this job and process next
      processNextJob();
      return;
    }

    processingCount++;
    processJob(jobId);
  } catch (error) {
    console.error(`[JOB] Error in processNextJob for ${jobId}:`, error);
    processNextJob();
  }
}

/**
 * Process a single job
 */
async function processJob(jobId: Id<"jobs">): Promise<void> {
  // Get job via getPendingJobs to avoid auth issues
  const pendingJobs = await convex.query(api.jobs.getPendingJobs, {});
  let job = pendingJobs.find((j: any) => j._id === jobId);
  if (!job) return;

  console.log(`[JOB] ${jobId}: Starting processing...`);
  const startTime = Date.now();

  try {
    await updateJobStatus(jobId, 'processing', 0);

    // Import modules dynamically to avoid circular dependencies
    const { parseSubtitleFile } = await import('./subtitle-parser');
    const { generateTTSWithTiming } = await import('./tts-generator');
    const { applySidechainCompression, convertToMP3 } = await import('./audio-processor');

    // Refresh job data
    const allJobs = await convex.query(api.jobs.getUserJobs, { userId: job.userId });
    job = allJobs.find((j: any) => j._id === jobId);
    if (!job) throw new Error('Job not found');

    // Create output directory
    const outputDir = path.join(path.dirname(job.files.subtitle), 'output');
    await fs.mkdir(outputDir, { recursive: true });
    console.log(`[JOB] ${jobId}: Output directory: ${outputDir}`);

    // Read and parse subtitle file
    await updateJobStatus(jobId, 'processing', 10);
    console.log(`[JOB] ${jobId}: Reading subtitle file: ${job.files.subtitle}`);
    const subtitleContent = await fs.readFile(job.files.subtitle, 'utf-8');
    const segments = parseSubtitleFile(subtitleContent);
    console.log(`[JOB] ${jobId}: Parsed ${segments.length} subtitle segments`);

    // Generate TTS audio with timing
    await updateJobStatus(jobId, 'processing', 20);
    console.log(`[JOB] ${jobId}: Starting TTS generation for ${segments.length} segments...`);
    const ttsAudioPath = path.join(outputDir, 'tts_audio.mp3');
    await generateTTSWithTiming(
      segments,
      ttsAudioPath,
      undefined,
      async (progress) => {
        await updateJobStatus(jobId, 'processing', 20 + progress * 0.4); // 20-60%
      }
    );
    console.log(`[JOB] ${jobId}: TTS audio generated: ${ttsAudioPath}`);

    await updateJobFiles(jobId, { ttsAudio: ttsAudioPath });

    // Refresh job data
    const updatedJobs = await convex.query(api.jobs.getUserJobs, { userId: job.userId });
    job = updatedJobs.find((j: any) => j._id === jobId);
    if (!job) throw new Error('Job not found');

    // Convert original audio to MP3 if needed
    await updateJobStatus(jobId, 'processing', 65);
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
    await updateJobStatus(jobId, 'processing', 75);
    console.log(`[JOB] ${jobId}: Applying sidechain compression...`);
    const mergedAudioPath = path.join(outputDir, 'merged_audio.mp3');
    await applySidechainCompression(
      convertedAudioPath,
      ttsAudioPath,
      mergedAudioPath
    );
    console.log(`[JOB] ${jobId}: Merged audio created: ${mergedAudioPath}`);

    await updateJobFiles(jobId, { mergedAudio: mergedAudioPath });

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
    await updateJobStatus(jobId, 'completed', 100);
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[JOB] ${jobId}: Error after ${duration}ms:`, error);
    await updateJobStatus(
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
