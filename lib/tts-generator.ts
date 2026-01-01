import { promises as fs } from 'fs';
import path from 'path';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { SubtitleSegment, TTSOptions } from './types';
import {
  getCacheKey,
  getCachedAudio,
  saveCachedAudio,
  copyCachedAudio,
} from './tts-cache';

// Default TTS options
const DEFAULT_TTS_OPTIONS: Required<TTSOptions> = {
  languageCode: 'pl-PL',
  voiceName: 'pl-PL-Standard-G',
  audioEncoding: 'MP3',
  speakingRate: 1.0,
  pitch: 0.0,
};

// Credit cost constants
export const CREDIT_COST_CACHE_MISS = 1.0;  // Full cost for new TTS generation
export const CREDIT_COST_CACHE_HIT = 0.5;   // Reduced cost for cached audio

// Result type for TTS generation with credit tracking
export interface TTSResult {
  cacheHit: boolean;
}

// Result type for segment generation
export interface TTSSegmentResult {
  filePath: string;
  cacheHit: boolean;
}

// Credit usage summary
export interface CreditUsage {
  cacheHits: number;
  cacheMisses: number;
  totalCredits: number;
}

/**
 * Get Google Cloud TTS client
 */
function getTTSClient(): TextToSpeechClient {
  return new TextToSpeechClient();
}

/**
 * Generate TTS audio for a single text segment
 * Uses cache to avoid regenerating the same sentences
 * Returns whether cache was used (for credit calculation)
 */
export async function generateTTS(
  text: string,
  outputPath: string,
  options?: TTSOptions
): Promise<TTSResult> {
  console.log(`[TTS] Generating audio for: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
  const startTime = Date.now();

  const opts = { ...DEFAULT_TTS_OPTIONS, ...options };
  const speakingRate = opts.speakingRate;

  // Generate cache key (excluding speakingRate)
  const cacheKey = getCacheKey(text, opts);

  // Check if we have cached audio
  const cachedPath = await getCachedAudio(cacheKey);

  if (cachedPath) {
    console.log(`[TTS] Cache hit for: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);

    // Copy cached audio to output
    await copyCachedAudio(cacheKey, outputPath);

    // If speakingRate is not 1.0, adjust the speed
    if (speakingRate !== undefined && speakingRate !== 1.0) {
      console.log(`[TTS] Adjusting cached audio speed to ${speakingRate.toFixed(2)}x`);
      const { adjustAudioSpeed } = await import('./audio-processor');
      const tempPath = outputPath.replace('.mp3', '_temp.mp3');
      
      // Move current file to temp
      await fs.rename(outputPath, tempPath);
      
      // Adjust speed and write to output
      await adjustAudioSpeed(tempPath, outputPath, speakingRate);
      
      // Clean up temp file
      await fs.unlink(tempPath);
    }

    const duration = Date.now() - startTime;
    console.log(`[TTS] Used cached audio in ${duration}ms: ${outputPath}`);
    return { cacheHit: true };
  }

  console.log(`[TTS] Cache miss, generating new audio...`);

  // Generate new audio via Google Cloud TTS
  const client = getTTSClient();

  // Request with speakingRate = 1.0 for base cache
  const request = {
    input: { text },
    voice: {
      languageCode: opts.languageCode,
      name: opts.voiceName,
    },
    audioConfig: {
      audioEncoding: opts.audioEncoding,
      speakingRate: 1.0, // Always generate at 1.0 for cache
      pitch: opts.pitch,
    },
  };

  const [response] = await client.synthesizeSpeech(request);
  const audioBuffer = response.audioContent as Buffer;

  // Save to cache
  await saveCachedAudio(cacheKey, audioBuffer);

  // Ensure directory exists
  const dir = path.dirname(outputPath);
  await fs.mkdir(dir, { recursive: true });

  // If speakingRate is not 1.0, adjust the speed
  if (speakingRate !== undefined && speakingRate !== 1.0) {
    console.log(`[TTS] Adjusting generated audio speed to ${speakingRate.toFixed(2)}x`);
    const tempPath = outputPath.replace('.mp3', '_temp.mp3');
    
    // Write base audio to temp
    await fs.writeFile(tempPath, audioBuffer, 'binary');
    
    // Adjust speed and write to output
    const { adjustAudioSpeed } = await import('./audio-processor');
    await adjustAudioSpeed(tempPath, outputPath, speakingRate);
    
    // Clean up temp file
    await fs.unlink(tempPath);
  } else {
    // Write audio directly to file
    await fs.writeFile(outputPath, audioBuffer, 'binary');
  }

  const duration = Date.now() - startTime;
  console.log(`[TTS] Generated audio in ${duration}ms: ${outputPath}`);
  return { cacheHit: false };
}

/**
 * Generate TTS audio for multiple subtitle segments with timing
 * This generates individual audio files for each segment
 * Adjusts speaking rate dynamically to match expected durations
 * Returns segment results with cache hit information for credit calculation
 */
export async function generateTTSSegments(
  segments: SubtitleSegment[],
  outputDir: string,
  options?: TTSOptions,
  onProgress?: (current: number, total: number) => void
): Promise<TTSSegmentResult[]> {
  console.log(`[TTS] Generating ${segments.length} TTS segments to ${outputDir}`);
  const startTime = Date.now();
  const results: TTSSegmentResult[] = [];

  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  const { getAudioDuration } = await import('./audio-processor');
  const baseSpeakingRate = options?.speakingRate ?? DEFAULT_TTS_OPTIONS.speakingRate;
  const syncThreshold = 0.5; // Maximum allowed difference in seconds before adjusting
  const maxSpeakingRate = 2.0; // Maximum speaking rate (Google TTS limit)
  const minSpeakingRate = 0.25; // Minimum speaking rate (Google TTS limit)

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (!segment || !segment.text || segment.text.trim().length === 0) {
      console.warn(`[TTS] Empty segment ${i + 1}/${segments.length}, generating silence instead`);
      // Generate a short silence file for empty segments to maintain timing
      const outputPath = path.join(outputDir, `segment_${i.toString().padStart(4, '0')}.mp3`);
      const { insertSilence } = await import('./audio-processor');
      const expectedDuration = segment?.end && segment?.start ? segment.end - segment.start : 0.1;
      await insertSilence(outputPath, Math.max(0.1, expectedDuration));
      // Empty segments don't count as TTS - no credit cost
      results.push({ filePath: outputPath, cacheHit: true });
      if (onProgress) {
        onProgress(i + 1, segments.length);
      }
      continue;
    }

    const outputPath = path.join(outputDir, `segment_${i.toString().padStart(4, '0')}.mp3`);
    const expectedDuration = segment.end - segment.start;

    console.log(`[TTS] Generating segment ${i + 1}/${segments.length}: "${segment.text.substring(0, 50)}${segment.text.length > 50 ? '...' : ''}"`);

    // Generate TTS with current options
    let currentOptions = { ...options };
    let actualDuration = 0;
    let attempts = 0;
    const maxAttempts = 3;
    let segmentCacheHit = false;

    while (attempts < maxAttempts) {
      const result = await generateTTS(segment.text, outputPath, currentOptions);
      // Only count the first attempt for cache hit (subsequent attempts are rate adjustments)
      if (attempts === 0) {
        segmentCacheHit = result.cacheHit;
      }
      actualDuration = await getAudioDuration(outputPath);
      
      const durationDiff = actualDuration - expectedDuration;

      // If duration is close enough or shorter than expected, we're done
      // We never slow down audio that's already fast enough
      if (durationDiff <= syncThreshold || expectedDuration <= 0 || durationDiff < 0) {
        if (durationDiff < 0) {
          console.log(
            `[TTS] Segment ${i + 1}/${segments.length}: Audio is faster than expected ` +
            `(expected: ${expectedDuration.toFixed(2)}s, actual: ${actualDuration.toFixed(2)}s, ` +
            `diff: ${durationDiff.toFixed(2)}s). Keeping as-is (no slowdown).`
          );
        }
        break;
      }

      // Only speed up if actualDuration > expectedDuration
      // Calculate new speaking rate to match expected duration
      // speakingRate is inversely proportional to duration
      // If actualDuration > expectedDuration, we need to speak faster (higher rate)
      const rateAdjustment = actualDuration / expectedDuration;
      const newSpeakingRate = (currentOptions.speakingRate ?? baseSpeakingRate) * rateAdjustment;

      // Clamp speaking rate to valid range
      const clampedRate = Math.max(minSpeakingRate, Math.min(maxSpeakingRate, newSpeakingRate));
      
      // If we've hit the max speaking rate and it's still not fast enough, stop trying
      if (clampedRate >= maxSpeakingRate && actualDuration > expectedDuration) {
        console.warn(
          `[TTS] Segment ${i + 1}/${segments.length}: Hit max speaking rate (${maxSpeakingRate}) ` +
          `but still too long (expected: ${expectedDuration.toFixed(2)}s, actual: ${actualDuration.toFixed(2)}s, ` +
          `diff: ${durationDiff.toFixed(2)}s). Keeping this version and will align subsequent segments.`
        );
        break;
      }
      
      console.log(
        `[TTS] Segment ${i + 1}/${segments.length}: Duration too long ` +
        `(expected: ${expectedDuration.toFixed(2)}s, actual: ${actualDuration.toFixed(2)}s, ` +
        `diff: ${durationDiff.toFixed(2)}s). Speeding up from ${(currentOptions.speakingRate ?? baseSpeakingRate).toFixed(2)} to ${clampedRate.toFixed(2)}`
      );

      currentOptions = { ...currentOptions, speakingRate: clampedRate };
      attempts++;
    }

    // Log final status
    const finalDiff = actualDuration - expectedDuration;
    if (finalDiff > syncThreshold) {
      console.warn(
        `[TTS] Segment ${i + 1}/${segments.length}: Still longer than expected after ${attempts} attempts ` +
        `(expected: ${expectedDuration.toFixed(2)}s, actual: ${actualDuration.toFixed(2)}s, ` +
        `diff: ${finalDiff.toFixed(2)}s). Subsequent segments will be aligned to compensate.`
      );
    } else if (finalDiff >= -syncThreshold && finalDiff <= syncThreshold) {
      console.log(
        `[TTS] Segment ${i + 1}/${segments.length}: Synced ` +
        `(expected: ${expectedDuration.toFixed(2)}s, actual: ${actualDuration.toFixed(2)}s)`
      );
    }

    results.push({ filePath: outputPath, cacheHit: segmentCacheHit });

    if (onProgress) {
      onProgress(i + 1, segments.length);
    }
  }

  const duration = Date.now() - startTime;
  const cacheHits = results.filter(r => r.cacheHit).length;
  const cacheMisses = results.length - cacheHits;
  console.log(`[TTS] Generated ${results.length} segment files from ${segments.length} segments in ${duration}ms`);
  console.log(`[TTS] Cache stats: ${cacheHits} hits, ${cacheMisses} misses`);
  
  if (results.length !== segments.length) {
    console.error(`[TTS] WARNING: Generated ${results.length} files but expected ${segments.length} segments!`);
  }
  
  return results;
}

/**
 * Generate complete TTS audio with silence periods
 * This creates a single audio file with proper timing
 * Returns credit usage information for billing
 */
export async function generateTTSWithTiming(
  segments: SubtitleSegment[],
  outputPath: string,
  options?: TTSOptions,
  onProgress?: (progress: number) => void
): Promise<CreditUsage> {
  console.log(`[TTS] Generating TTS with timing to ${outputPath}`);
  const startTime = Date.now();
  
  const { insertSilence, concatenateAudioFiles } = await import('./audio-processor');
  
  // Create temporary directory for segments
  const tempDir = path.join(path.dirname(outputPath), 'temp_segments');
  await fs.mkdir(tempDir, { recursive: true });
  console.log(`[TTS] Created temp directory: ${tempDir}`);

  // Track credit usage
  let creditUsage: CreditUsage = { cacheHits: 0, cacheMisses: 0, totalCredits: 0 };

  try {
    // Generate TTS for each segment
    console.log(`[TTS] Starting generation of ${segments.length} segments...`);
    const segmentResults = await generateTTSSegments(
      segments,
      tempDir,
      options,
      (current, total) => {
        if (onProgress) {
          onProgress((current / total) * 50); // First 50% for TTS generation
        }
      }
    );

    // Calculate credit usage from segment results
    creditUsage.cacheHits = segmentResults.filter(r => r.cacheHit).length;
    creditUsage.cacheMisses = segmentResults.filter(r => !r.cacheHit).length;
    creditUsage.totalCredits = 
      (creditUsage.cacheHits * CREDIT_COST_CACHE_HIT) + 
      (creditUsage.cacheMisses * CREDIT_COST_CACHE_MISS);

    console.log(`[TTS] Credit usage: ${creditUsage.cacheHits} cache hits (${creditUsage.cacheHits * CREDIT_COST_CACHE_HIT} credits), ${creditUsage.cacheMisses} cache misses (${creditUsage.cacheMisses * CREDIT_COST_CACHE_MISS} credits), total: ${creditUsage.totalCredits} credits`);

    // Extract file paths for further processing
    const segmentFiles = segmentResults.map(r => r.filePath);

    // Verify all segments were generated
    if (segmentFiles.length !== segments.length) {
      throw new Error(
        `[TTS] Mismatch: Generated ${segmentFiles.length} segment files but expected ${segments.length} segments`
      );
    }
    console.log(`[TTS] Successfully generated ${segmentFiles.length} segment files`);

    // Measure actual durations and calculate cumulative drift compensation
    const { getAudioDuration } = await import('./audio-processor');
    const actualDurations: number[] = [];
    let cumulativeDrift = 0; // Track cumulative timing drift

    for (let i = 0; i < segmentFiles.length; i++) {
      try {
        const actualDuration = await getAudioDuration(segmentFiles[i]);
        actualDurations.push(actualDuration);
        const expectedDuration = segments[i].end - segments[i].start;
        const segmentDrift = actualDuration - expectedDuration;
        cumulativeDrift += segmentDrift;
      } catch (error) {
        console.error(`[TTS] Error getting duration for segment ${i + 1}: ${segmentFiles[i]}`, error);
        throw error;
      }
    }

    console.log(`[TTS] Measured durations for ${actualDurations.length} segments. Cumulative drift: ${cumulativeDrift.toFixed(2)}s`);

    // Create audio files with silence, adjusting gaps to compensate for drift
    const audioWithSilence: string[] = [];
    let currentDrift = 0; // Track drift up to current position

    console.log(`[TTS] Processing ${segments.length} segments for final output`);
    console.log(`[TTS] Segment files available: ${segmentFiles.length}`);

    if (segmentFiles.length === 0) {
      throw new Error('[TTS] No segment files were generated!');
    }

    for (let i = 0; i < segments.length; i++) {
      // Verify segment file exists
      if (!segmentFiles[i]) {
        throw new Error(`[TTS] Missing segment file for segment ${i + 1}/${segments.length}`);
      }

      // Add the TTS segment
      console.log(`[TTS] Adding segment ${i + 1}/${segments.length}: ${segmentFiles[i]}`);
      audioWithSilence.push(segmentFiles[i]);

      // Update current drift based on this segment
      const expectedDuration = segments[i].end - segments[i].start;
      const segmentDrift = actualDurations[i] - expectedDuration;
      currentDrift += segmentDrift;

      // Calculate gap after this segment (if not the last segment)
      if (i < segments.length - 1) {
        const nextSegment = segments[i + 1];
        const originalGapDuration = nextSegment.start - segments[i].end;
        
        // Handle overlapping segments (shouldn't happen, but handle gracefully)
        if (originalGapDuration < 0) {
          console.warn(
            `[TTS] Segment ${i + 1} overlaps with segment ${i + 2}: ` +
            `segment ${i + 1} ends at ${segments[i].end.toFixed(2)}s, ` +
            `segment ${i + 2} starts at ${nextSegment.start.toFixed(2)}s. ` +
            `Skipping gap insertion.`
          );
          // Don't add silence for overlapping segments
        } else if (originalGapDuration > 0.01) {
          // Only add silence if there's a meaningful gap (at least 0.01 seconds to avoid rounding issues)
          // Adjust silence duration to compensate for drift
          // If we're ahead (positive drift = segment took longer), reduce silence
          // If we're behind (negative drift = segment was shorter), increase silence
          const adjustedSilenceDuration = Math.max(0, originalGapDuration - currentDrift);
          
          // Calculate how much drift we actually compensated
          // The compensation is the difference between original and adjusted gap
          const compensatedDrift = originalGapDuration - adjustedSilenceDuration;
          
          // Carry forward any remaining drift that couldn't be fully compensated
          // (e.g., if drift is 2s but gap is only 0.5s, we can only compensate 0.5s)
          currentDrift -= compensatedDrift;
          
          // Only log if adjustment is significant
          if (Math.abs(compensatedDrift) > 0.1 || Math.abs(currentDrift) > 0.1) {
            console.log(
              `[TTS] Gap ${i}: Original ${originalGapDuration.toFixed(2)}s, ` +
              `adjusted to ${adjustedSilenceDuration.toFixed(2)}s ` +
              `(compensated: ${compensatedDrift.toFixed(2)}s, remaining drift: ${currentDrift.toFixed(2)}s)`
            );
          }

          // Only create and add silence file if duration is meaningful (> 0.01s)
          // Zero or very small silence files can cause concatenation issues
          if (adjustedSilenceDuration > 0.01) {
            const silenceFile = path.join(tempDir, `silence_${i}.mp3`);
            await insertSilence(silenceFile, adjustedSilenceDuration);
            audioWithSilence.push(silenceFile);
          } else {
            console.log(`[TTS] Gap ${i}: Skipping silence insertion (duration too small: ${adjustedSilenceDuration.toFixed(3)}s)`);
          }
        } else if (currentDrift < -0.1) {
          // If there's no gap but we're behind (negative drift), add silence to catch up
          // If we're ahead (positive drift) and there's no gap, we can't reduce it, so carry it forward
          const compensationSilence = -currentDrift; // Convert negative drift to positive silence duration
          const wasBehind = compensationSilence;
          
          // Only create compensation silence if duration is meaningful
          if (compensationSilence > 0.01) {
            const silenceFile = path.join(tempDir, `silence_${i}_compensation.mp3`);
            await insertSilence(silenceFile, compensationSilence);
            audioWithSilence.push(silenceFile);
            currentDrift = 0; // We've caught up
            console.log(
              `[TTS] Gap ${i}: No natural gap, adding ${compensationSilence.toFixed(2)}s compensation ` +
              `to catch up (was behind by ${wasBehind.toFixed(2)}s)`
            );
          } else {
            console.log(`[TTS] Gap ${i}: Compensation needed but duration too small (${compensationSilence.toFixed(3)}s), skipping`);
          }
        }
      }

      if (onProgress) {
        onProgress(50 + ((i + 1) / segments.length) * 50); // Last 50% for silence insertion
      }
    }

    // Validate all files exist before concatenation
    const validFiles: string[] = [];
    for (const file of audioWithSilence) {
      try {
        const stats = await fs.stat(file);
        if (stats.size > 0) {
          validFiles.push(file);
        } else {
          console.warn(`[TTS] Skipping empty file: ${file}`);
        }
      } catch (error) {
        console.error(`[TTS] File not found or error accessing: ${file}`, error);
        throw new Error(`Missing or invalid audio file: ${file}`);
      }
    }

    console.log(`[TTS] Concatenating ${validFiles.length} valid audio files (${segments.length} segments + ${validFiles.length - segments.length} silence gaps)...`);
    console.log(`[TTS] Expected total segments: ${segments.length}, Valid files to concatenate: ${validFiles.length}`);
    
    if (validFiles.length === 0) {
      throw new Error('[TTS] No valid audio files to concatenate!');
    }
    
    if (validFiles.length < segments.length) {
      console.warn(`[TTS] WARNING: Only ${validFiles.length} valid files but ${segments.length} segments expected!`);
    }
    
    await concatenateAudioFiles(validFiles, outputPath);
    
    const duration = Date.now() - startTime;
    console.log(`[TTS] TTS with timing completed in ${duration}ms`);
    
    return creditUsage;
  } finally {
    // Clean up temporary directory
    try {
      // await fs.rm(tempDir, { recursive: true, force: true });
      console.log(`[TTS] Cleaned up temp directory: ${tempDir}`);
    } catch (error) {
      console.error('[TTS] Error cleaning up temp directory:', error);
    }
  }
}

/**
 * Clean text for TTS (remove HTML tags, extra whitespace, etc.)
 */
export function cleanTextForTTS(text: string): string {
  return text
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
    .replace(/&nbsp;/g, ' ') // Replace &nbsp;
    .replace(/&amp;/g, '&') // Replace &amp;
    .replace(/&lt;/g, '<') // Replace &lt;
    .replace(/&gt;/g, '>') // Replace &gt;
    .trim();
}

