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
import { trackTTSCharacters } from './influx-stats';

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
  return new TextToSpeechClient({
    credentials: JSON.parse(process.env.GOOGLE_CLOUD_KEY_JSON!),
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  });
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
  // Clean text before processing (remove HTML tags, normalize whitespace, etc.)
  const cleanedText = cleanTextForTTS(text);
  console.log(`[TTS] Generating audio for: "${cleanedText.substring(0, 50)}${cleanedText.length > 50 ? '...' : ''}"`);
  const startTime = Date.now();

  const opts = { ...DEFAULT_TTS_OPTIONS, ...options };
  const speakingRate = opts.speakingRate;

  // Generate cache key using cleaned text (excluding speakingRate)
  const cacheKey = getCacheKey(cleanedText, opts);

  // Check if we have cached audio
  const cachedPath = await getCachedAudio(cacheKey);

  if (cachedPath) {
    console.log(`[TTS] Cache hit for: "${cleanedText.substring(0, 50)}${cleanedText.length > 50 ? '...' : ''}"`);

    // Convert cached MP3 to WAV, and adjust speed if speakingRate is not 1.0
    const { convertAudioToWav, adjustAudioSpeed } = await import('./audio-processor');
    const tempWavPath = outputPath.replace('.wav', '_temp.wav');
    
    // Convert cached MP3 to WAV
    await convertAudioToWav(cachedPath, tempWavPath);
    
    if (speakingRate !== undefined && speakingRate !== 1.0) {
      console.log(`[TTS] Adjusting cached audio speed to ${speakingRate.toFixed(2)}x`);
      // Adjust speed and write to output
      await adjustAudioSpeed(tempWavPath, outputPath, speakingRate);
      // Clean up temp file
      await fs.unlink(tempWavPath);
    } else {
      // Just rename the WAV file to output
      await fs.rename(tempWavPath, outputPath);
    }

    const duration = Date.now() - startTime;
    console.log(`[TTS] Used cached audio in ${duration}ms: ${outputPath}`);
    return { cacheHit: true };
  }

  console.log(`[TTS] Cache miss, generating new audio...`);

  // Generate new audio via Google Cloud TTS
  const client = getTTSClient();

  // Request with speakingRate = 1.0 for base cache
  // Use cleaned text to ensure proper encoding and remove any HTML/formatting
  // Log the actual text being sent to verify encoding (first 100 chars)
  const textPreview = cleanedText.length > 100 
    ? cleanedText.substring(0, 100) + '...' 
    : cleanedText;
  console.log(`[TTS] Sending text to Google TTS (${cleanedText.length} chars): "${textPreview}"`);
  console.log(`[TTS] Text encoding check - contains Polish chars: ${/[ąćęłńóśźż]/i.test(cleanedText)}`);
  
  const request = {
    input: { text: cleanedText },
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

  // Track character count for statistics (cache miss = actual synthesis)
  // Fire-and-forget: don't await to avoid blocking TTS generation
  trackTTSCharacters(cleanedText.length).catch((err) => {
    console.error('[TTS] Failed to track character stats:', err);
  });

  // Save to cache
  await saveCachedAudio(cacheKey, audioBuffer);

  // Ensure directory exists
  const dir = path.dirname(outputPath);
  await fs.mkdir(dir, { recursive: true });

  // Convert MP3 from Google TTS to WAV, and adjust speed if needed
  const { convertAudioToWav, adjustAudioSpeed } = await import('./audio-processor');
  const tempMp3Path = outputPath.replace('.wav', '_temp.mp3');
  const tempWavPath = outputPath.replace('.wav', '_temp_converted.wav');
  
  // Write MP3 from Google TTS to temp file
  await fs.writeFile(tempMp3Path, audioBuffer, 'binary');
  
  // Convert MP3 to WAV
  await convertAudioToWav(tempMp3Path, tempWavPath);
  await fs.unlink(tempMp3Path);
  
  if (speakingRate !== undefined && speakingRate !== 1.0) {
    console.log(`[TTS] Adjusting generated audio speed to ${speakingRate.toFixed(2)}x`);
    // Adjust speed and write to output
    await adjustAudioSpeed(tempWavPath, outputPath, speakingRate);
    // Clean up temp file
    await fs.unlink(tempWavPath);
  } else {
    // Just rename the WAV file to output
    await fs.rename(tempWavPath, outputPath);
  }

  const duration = Date.now() - startTime;
  console.log(`[TTS] Generated audio in ${duration}ms: ${outputPath}`);
  return { cacheHit: false };
}

// Extended result type to track timing overflow
export interface TTSSegmentResultWithOverflow extends TTSSegmentResult {
  overflow: number; // How much time this segment overflows (positive = too long)
  expectedDuration: number; // The expected duration for timing calculations
  actualDuration: number; // The actual duration of the generated audio
}

/**
 * Generate TTS audio for multiple subtitle segments with timing
 * This generates individual audio files for each segment
 * Adjusts speaking rate dynamically to match expected durations
 * If still too long after max speed-up, tries to trim trailing silence
 * Returns segment results with overflow information for timing debt tracking
 */
export async function generateTTSSegments(
  segments: SubtitleSegment[],
  outputDir: string,
  options?: TTSOptions,
  onProgress?: (current: number, total: number) => void
): Promise<TTSSegmentResultWithOverflow[]> {
  console.log(`[TTS] Generating ${segments.length} TTS segments to ${outputDir}`);
  const startTime = Date.now();
  const results: TTSSegmentResultWithOverflow[] = [];

  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  const { getAudioDuration, trimTrailingSilence } = await import('./audio-processor');
  const baseSpeakingRate = options?.speakingRate ?? DEFAULT_TTS_OPTIONS.speakingRate;
  const syncThreshold = 0.5; // Maximum allowed difference in seconds before adjusting
  const maxSpeakingRate = 2.0; // Maximum speaking rate (Google TTS limit)
  const minSpeakingRate = 0.25; // Minimum speaking rate (Google TTS limit)

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (!segment || !segment.text || segment.text.trim().length === 0) {
      console.warn(`[TTS] Empty segment ${i + 1}/${segments.length}, generating silence instead`);
      // Generate a short silence file for empty segments to maintain timing
      const outputPath = path.join(outputDir, `segment_${i.toString().padStart(4, '0')}.wav`);
      const { insertSilence } = await import('./audio-processor');
      const expectedDuration = segment?.end && segment?.start ? segment.end - segment.start : 0.1;
      await insertSilence(outputPath, Math.max(0.1, expectedDuration));
      // Empty segments don't count as TTS - no credit cost
      results.push({ 
        filePath: outputPath, 
        cacheHit: true, 
        overflow: 0, 
        expectedDuration, 
        actualDuration: expectedDuration 
      });
      if (onProgress) {
        onProgress(i + 1, segments.length);
      }
      continue;
    }

    const outputPath = path.join(outputDir, `segment_${i.toString().padStart(4, '0')}.wav`);
    const baseExpectedDuration = segment.end - segment.start;
    let expectedDuration = baseExpectedDuration; // Can be extended if gap is available

    console.log(`[TTS] Generating segment ${i + 1}/${segments.length}: "${segment.text.substring(0, 50)}${segment.text.length > 50 ? '...' : ''}"`);

    // Generate TTS with current options
    let currentOptions = { ...options };
    let actualDuration = 0;
    let attempts = 0;
    const maxAttempts = 3;
    let segmentCacheHit = false;
    let gapExtensionApplied = false;

    while (attempts < maxAttempts) {
      const result = await generateTTS(segment.text, outputPath, currentOptions);
      // Only count the first attempt for cache hit (subsequent attempts are rate adjustments)
      if (attempts === 0) {
        segmentCacheHit = result.cacheHit;
      }
      actualDuration = await getAudioDuration(outputPath);
      
      // After first attempt, check if we can extend into the next gap to reduce speed-up
      if (attempts === 0 && !gapExtensionApplied && actualDuration > baseExpectedDuration) {
        // Check if there's a gap before the next segment that we can use
        if (i < segments.length - 1) {
          const nextSegment = segments[i + 1];
          const gapToNextSegment = nextSegment.start - segment.end;
          
          // Only consider meaningful gaps (> 0.01s to avoid rounding issues)
          if (gapToNextSegment > 0.01) {
            const extraTimeNeeded = actualDuration - baseExpectedDuration;
            // Use only the portion of the gap we actually need
            const gapToUse = Math.min(gapToNextSegment, extraTimeNeeded);
            
            if (gapToUse > 0.01) {
              expectedDuration = baseExpectedDuration + gapToUse;
              gapExtensionApplied = true;
              console.log(
                `[TTS] Segment ${i + 1}/${segments.length}: Extending into gap ` +
                `(original slot: ${baseExpectedDuration.toFixed(2)}s, audio: ${actualDuration.toFixed(2)}s, ` +
                `gap available: ${gapToNextSegment.toFixed(2)}s, using: ${gapToUse.toFixed(2)}s, ` +
                `new expected: ${expectedDuration.toFixed(2)}s)`
              );
            }
          }
        }
      }
      
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
      
      // If we've hit the max speaking rate and it's still not fast enough, stop trying speed-up
      if (clampedRate >= maxSpeakingRate && actualDuration > expectedDuration) {
        console.warn(
          `[TTS] Segment ${i + 1}/${segments.length}: Hit max speaking rate (${maxSpeakingRate}) ` +
          `but still too long (expected: ${expectedDuration.toFixed(2)}s, actual: ${actualDuration.toFixed(2)}s, ` +
          `diff: ${durationDiff.toFixed(2)}s). Will try trimming silence next.`
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

    // After speed adjustment, check if still too long and try trimming trailing silence
    let finalDiff = actualDuration - expectedDuration;
    if (finalDiff > syncThreshold) {
      console.log(
        `[TTS] Segment ${i + 1}/${segments.length}: Still too long after speed adjustment, ` +
        `trying to trim trailing silence...`
      );
      
      // Try trimming trailing silence
      const trimmedPath = outputPath.replace('.wav', '_trimmed.wav');
      try {
        await trimTrailingSilence(outputPath, trimmedPath);
        const trimmedDuration = await getAudioDuration(trimmedPath);
        
        if (trimmedDuration < actualDuration) {
          // Trimming helped, use the trimmed version
          await fs.unlink(outputPath);
          await fs.rename(trimmedPath, outputPath);
          const savedTime = actualDuration - trimmedDuration;
          actualDuration = trimmedDuration;
          finalDiff = actualDuration - expectedDuration;
          
          console.log(
            `[TTS] Segment ${i + 1}/${segments.length}: Trimmed ${savedTime.toFixed(3)}s of trailing silence. ` +
            `New duration: ${actualDuration.toFixed(2)}s (${finalDiff > 0 ? '+' : ''}${finalDiff.toFixed(2)}s from expected)`
          );
        } else {
          // Trimming didn't help, clean up
          await fs.unlink(trimmedPath).catch(() => {});
          console.log(
            `[TTS] Segment ${i + 1}/${segments.length}: No trailing silence to trim.`
          );
        }
      } catch (trimError) {
        // Trimming failed, continue with original file
        console.warn(
          `[TTS] Segment ${i + 1}/${segments.length}: Failed to trim silence:`, trimError
        );
        // Clean up trimmed file if it exists
        await fs.unlink(trimmedPath).catch(() => {});
      }
    }

    // Calculate final overflow (positive = segment is too long, negative = segment is too short)
    const overflow = actualDuration - expectedDuration;

    // Log final status
    if (overflow > syncThreshold) {
      console.warn(
        `[TTS] Segment ${i + 1}/${segments.length}: OVERFLOW - Still ${overflow.toFixed(2)}s too long after all optimizations. ` +
        `(expected: ${expectedDuration.toFixed(2)}s, actual: ${actualDuration.toFixed(2)}s). ` +
        `This will be compensated by shortening future gaps.`
      );
    } else if (Math.abs(overflow) <= syncThreshold) {
      console.log(
        `[TTS] Segment ${i + 1}/${segments.length}: Synced ` +
        `(expected: ${expectedDuration.toFixed(2)}s, actual: ${actualDuration.toFixed(2)}s)`
      );
    }

    results.push({ 
      filePath: outputPath, 
      cacheHit: segmentCacheHit, 
      overflow,
      expectedDuration,
      actualDuration
    });

    if (onProgress) {
      onProgress(i + 1, segments.length);
    }
  }

  const duration = Date.now() - startTime;
  const cacheHits = results.filter(r => r.cacheHit).length;
  const cacheMisses = results.length - cacheHits;
  const totalOverflow = results.reduce((sum, r) => sum + Math.max(0, r.overflow), 0);
  console.log(`[TTS] Generated ${results.length} segment files from ${segments.length} segments in ${duration}ms`);
  console.log(`[TTS] Cache stats: ${cacheHits} hits, ${cacheMisses} misses`);
  console.log(`[TTS] Total timing overflow to compensate: ${totalOverflow.toFixed(2)}s`);
  
  if (results.length !== segments.length) {
    console.error(`[TTS] WARNING: Generated ${results.length} files but expected ${segments.length} segments!`);
  }
  
  return results;
}

/**
 * Generate complete TTS audio with silence periods
 * This creates a single audio file with proper timing
 * Tracks timing debt (overflow) and pays it back by shortening gaps
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

  // Sort segments by start time to ensure correct order
  segments.sort((a, b) => a.start - b.start);

  // Track credit usage
  const creditUsage: CreditUsage = { cacheHits: 0, cacheMisses: 0, totalCredits: 0 };

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

    // Verify all segments were generated
    if (segmentResults.length !== segments.length) {
      throw new Error(
        `[TTS] Mismatch: Generated ${segmentResults.length} segment files but expected ${segments.length} segments`
      );
    }
    console.log(`[TTS] Successfully generated ${segmentResults.length} segment files`);

    // Calculate total overflow that needs to be compensated
    const totalOverflow = segmentResults.reduce((sum, r) => sum + Math.max(0, r.overflow), 0);
    console.log(`[TTS] Total timing overflow to compensate: ${totalOverflow.toFixed(2)}s`);

    // Create audio files with silence, using timing debt system
    // timingDebt tracks how much time we've "borrowed" from future gaps
    // Positive debt = we're ahead of schedule (segments ran long), need to catch up
    // Negative debt = we're behind schedule (segments ran short), have extra time
    const audioWithSilence: string[] = [];
    let timingDebt = 0; // Time borrowed from future gaps (positive = we're ahead, need to catch up)
    let actualTimelinePosition = 0; // Track where we actually are in the timeline

    // Check for initial silence (before first segment)
    if (segments.length > 0 && segments[0].start > 0.001) {
      console.log(`[TTS] Adding initial silence of ${segments[0].start.toFixed(2)}s`);
      const initialSilenceFile = path.join(tempDir, 'silence_initial.wav');
      await insertSilence(initialSilenceFile, segments[0].start);
      audioWithSilence.push(initialSilenceFile);
      actualTimelinePosition = segments[0].start;
    }

    console.log(`[TTS] Processing ${segments.length} segments for final output with timing debt compensation`);

    if (segmentResults.length === 0) {
      throw new Error('[TTS] No segment files were generated!');
    }

    for (let i = 0; i < segments.length; i++) {
      const segmentResult = segmentResults[i];
      const segment = segments[i];
      
      // Verify segment file exists
      if (!segmentResult?.filePath) {
        throw new Error(`[TTS] Missing segment file for segment ${i + 1}/${segments.length}`);
      }

      // Expected timing
      const expectedStartTime = segment.start;
      const expectedEndTime = segment.end;
      const expectedDuration = expectedEndTime - expectedStartTime;
      const actualDuration = segmentResult.actualDuration;

      // CRITICAL: Ensure we're at the correct position BEFORE adding this segment
      // This prevents speech from starting too early
      const gapToExpectedStart = expectedStartTime - actualTimelinePosition;
      
      if (gapToExpectedStart > 0.01) {
        // We're behind where we should be - add silence to reach the expected start time
        console.log(
          `[TTS] Segment ${i + 1}: Adding ${gapToExpectedStart.toFixed(3)}s pre-segment silence ` +
          `to align to expected start (pos: ${actualTimelinePosition.toFixed(3)}s -> ${expectedStartTime.toFixed(3)}s)`
        );
        const alignmentFile = path.join(tempDir, `align_${i}.wav`);
        await insertSilence(alignmentFile, gapToExpectedStart);
        audioWithSilence.push(alignmentFile);
        actualTimelinePosition = expectedStartTime;
      } else if (gapToExpectedStart < -0.01) {
        // We're ahead of where we should be - this is timing debt we need to track
        // Can't go back in time, so segment will start early
        const aheadBy = -gapToExpectedStart;
        timingDebt += aheadBy;
        console.warn(
          `[TTS] Segment ${i + 1}: Starting ${aheadBy.toFixed(3)}s early ` +
          `(pos: ${actualTimelinePosition.toFixed(3)}s, expected: ${expectedStartTime.toFixed(3)}s). ` +
          `Added to timing debt: ${timingDebt.toFixed(2)}s`
        );
      }

      // Add the TTS segment
      console.log(
        `[TTS] Adding segment ${i + 1}/${segments.length}: ` +
        `(expected: ${expectedStartTime.toFixed(2)}s-${expectedEndTime.toFixed(2)}s, ` +
        `actual duration: ${actualDuration.toFixed(2)}s, ` +
        `overflow: ${segmentResult.overflow > 0 ? '+' : ''}${segmentResult.overflow.toFixed(2)}s, ` +
        `debt: ${timingDebt.toFixed(2)}s)`
      );
      audioWithSilence.push(segmentResult.filePath);
      
      // Update timeline position based on actual duration
      actualTimelinePosition += actualDuration;

      // Calculate gap to next segment (if not the last segment)
      if (i < segments.length - 1) {
        const nextSegment = segments[i + 1];
        const expectedNextStartTime = nextSegment.start;
        
        // Calculate the ACTUAL gap needed from where we are to where we need to be
        const gapNeeded = expectedNextStartTime - actualTimelinePosition;
        
        // Original gap from subtitle timing (for logging)
        const originalGap = expectedNextStartTime - expectedEndTime;
        
        if (gapNeeded < -0.01) {
          // We're already past the next segment's start time - timing debt situation
          // The next segment will start early, and we'll add this to debt in the next iteration
          console.warn(
            `[TTS] Gap ${i}: Already past next segment's start! ` +
            `Current pos: ${actualTimelinePosition.toFixed(2)}s, Next expected: ${expectedNextStartTime.toFixed(2)}s. ` +
            `Next segment will start ${(-gapNeeded).toFixed(2)}s early.`
          );
          // Don't add silence - we're already ahead
        } else if (gapNeeded > 0.01) {
          // We have time before the next segment
          // Check if we can use some of this gap to pay back timing debt
          let adjustedGap = gapNeeded;
          
          if (timingDebt > 0.01) {
            // We have debt to pay back - shorten the gap
            const debtToPay = Math.min(timingDebt, gapNeeded - 0.01); // Keep at least 0.01s gap
            if (debtToPay > 0.01) {
              adjustedGap = gapNeeded - debtToPay;
              timingDebt -= debtToPay;
              console.log(
                `[TTS] Gap ${i}: Paying back ${debtToPay.toFixed(2)}s debt. ` +
                `Gap: ${gapNeeded.toFixed(2)}s -> ${adjustedGap.toFixed(2)}s, ` +
                `Remaining debt: ${timingDebt.toFixed(2)}s`
              );
            }
          }
          
          // Add the (possibly shortened) silence gap
          if (adjustedGap > 0.01) {
            const silenceFile = path.join(tempDir, `silence_${i}.wav`);
            await insertSilence(silenceFile, adjustedGap);
            audioWithSilence.push(silenceFile);
            actualTimelinePosition += adjustedGap;
            
            // Log if gap was significantly different from original
            const gapDiff = adjustedGap - originalGap;
            if (Math.abs(gapDiff) > 0.1) {
              console.log(
                `[TTS] Gap ${i}: Adjusted from original ${originalGap.toFixed(2)}s to ${adjustedGap.toFixed(2)}s ` +
                `(${gapDiff > 0 ? '+' : ''}${gapDiff.toFixed(2)}s)`
              );
            }
          }
        }
        // If gapNeeded is between -0.01 and 0.01, we're essentially at the right position
      }

      if (onProgress) {
        onProgress(50 + ((i + 1) / segments.length) * 50); // Last 50% for silence insertion
      }
    }

    // Log final timing debt status
    if (Math.abs(timingDebt) > 0.1) {
      console.warn(
        `[TTS] Final timing debt: ${timingDebt.toFixed(2)}s. ` +
        `${timingDebt > 0 ? 'Audio will end ahead of expected time.' : 'Audio will end behind expected time.'}`
      );
    } else {
      console.log(`[TTS] Timing debt fully compensated. Final debt: ${timingDebt.toFixed(2)}s`);
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
    
    if (validFiles.length === 0) {
      throw new Error('[TTS] No valid audio files to concatenate!');
    }
    
    await concatenateAudioFiles(validFiles, outputPath);
    
    const duration = Date.now() - startTime;
    console.log(`[TTS] TTS with timing completed in ${duration}ms`);
    
    return creditUsage;
  } finally {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
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

