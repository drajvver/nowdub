import { promises as fs } from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';

// Type assertion for fluent-ffmpeg
const ffmpegAny = ffmpeg as any;

/**
 * Insert silence into an audio file
 * Uses raw audio generation method (more reliable than lavfi)
 */
export async function insertSilence(
  outputPath: string,
  duration: number
): Promise<void> {
  console.log(`[AUDIO] Creating silence: ${duration.toFixed(3)}s -> ${outputPath}`);
  const startTime = Date.now();
  
  return new Promise((resolve, reject) => {
    // Generate raw silence bytes and encode to WAV
    // This method is more universally supported than lavfi
    const sampleRate = 44100;
    const channels = 2;
    const bytesPerSample = 2; // 16-bit = 2 bytes
    const numSamples = Math.floor(duration * sampleRate);
    const bufferSize = numSamples * channels * bytesPerSample;
    
    // Create a buffer of zeros (silence)
    const silenceBuffer = Buffer.alloc(bufferSize, 0);
    const tempRawFile = outputPath.replace('.wav', '.raw');
    
    // Write raw audio file
    fs.writeFile(tempRawFile, silenceBuffer)
      .then(() => {
        console.log(`[AUDIO] Generated ${bufferSize} bytes of raw silence`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ffmpegAny()
          .input(tempRawFile)
          .inputOptions([
            '-f', 's16le',
            '-ar', sampleRate.toString(),
            '-ac', channels.toString()
          ])
          .audioCodec('pcm_s16le')
          .audioFrequency(sampleRate)
          .audioChannels(channels)
          .on('error', (err: any) => {
            console.error(`[AUDIO] FFmpeg error encoding silence:`, err);
            // Clean up temp file
            fs.unlink(tempRawFile).catch(() => {});
            reject(new Error(`FFmpeg error: ${err.message}`));
          })
          .on('end', () => {
            // Clean up temp file
            fs.unlink(tempRawFile).catch(() => {});
            const processingDuration = Date.now() - startTime;
            console.log(`[AUDIO] Silence created in ${processingDuration}ms`);
            resolve();
          })
          .save(outputPath);
      })
      .catch((writeErr) => {
        console.error(`[AUDIO] Error writing raw silence file:`, writeErr);
        reject(new Error(`Failed to create silence: ${writeErr.message}`));
      });
  });
}

/**
 * Concatenate multiple audio files into one
 */
export async function concatenateAudioFiles(
  inputFiles: string[],
  outputPath: string
): Promise<void> {
  console.log(`[AUDIO] Concatenating ${inputFiles.length} audio files to ${outputPath}`);
  const startTime = Date.now();
  
  return new Promise((resolve, reject) => {
    const dir = path.dirname(outputPath);
    
    // Create a concat list file
    const listFile = path.join(dir, 'concat_list.txt');
    const listContent = inputFiles.map(file => `file '${file.replace(/\\/g, '/')}'`).join('\n');
    
    fs.writeFile(listFile, listContent)
      .then(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ffmpegAny()
          .input(listFile)
          .inputOptions(['-f', 'concat', '-safe', '0'])
          .audioCodec('pcm_s16le')
          .audioFrequency(44100)
          .audioChannels(2)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .on('error', (err: any) => {
            console.error(`[AUDIO] FFmpeg error concatenating:`, err);
            reject(new Error(`FFmpeg error: ${err.message}`));
          })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .on('end', () => {
            // Clean up list file
            fs.unlink(listFile).catch(() => {});
            const duration = Date.now() - startTime;
            console.log(`[AUDIO] Concatenated ${inputFiles.length} files in ${duration}ms`);
            resolve();
          })
          .save(outputPath);
      })
      .catch(reject);
  });
}

/**
 * Apply sidechain compression to merge TTS audio with original audio
 * The original audio will be ducked (lowered) when the TTS audio is playing
 * When TTS is silent, the original audio returns to normal volume
 */

export async function applySidechainCompression(
  originalAudio: string,
  ttsAudio: string,
  outputPath: string,
  options?: {
    threshold?: number; // dB threshold for compression (default: -20)
    ratio?: number; // Compression ratio (default: 4)
    attack?: number; // Attack time in ms (default: 20)
    release?: number; // Release time in ms (default: 250)
    makeupGain?: number; // Makeup gain in dB (default: 0)
  }
): Promise<void> {
  const opts = {
    threshold: options?.threshold ?? -35,
    ratio: options?.ratio ?? 15,
    attack: options?.attack ?? 10, // in milliseconds (fast attack for immediate ducking)
    release: options?.release ?? 500, // in milliseconds (faster release)
    makeupGain: options?.makeupGain ?? 0,
  };

  // Convert milliseconds to seconds for FFmpeg (acompressor expects seconds)
  const attackSeconds = opts.attack / 1000;
  const releaseSeconds = opts.release / 1000;

  console.log(`[AUDIO] Applying sidechain compression (ducking original audio when TTS plays)...`);
  console.log(`[AUDIO]   Original audio: ${originalAudio} (will be ducked)`);
  console.log(`[AUDIO]   TTS audio: ${ttsAudio} (sidechain signal)`);
  console.log(`[AUDIO]   Compression settings: Threshold=${opts.threshold}dB, Ratio=${opts.ratio}, Attack=${opts.attack}ms (${attackSeconds}s), Release=${opts.release}ms (${releaseSeconds}s)`);
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    // Try sidechaincompress filter first (if available)
    // If not available, fall back to volume-based approach
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const command = ffmpegAny()
      .input(originalAudio)
      .input(ttsAudio);
    
    // Try using sidechaincompress filter (designed for this purpose)
    // Syntax: [main][sidechain]sidechaincompress=threshold=X:ratio=Y:attack=Z:release=W
    command.complexFilter([
      // 1. Apply sidechain compression to the original audio (ducking it when TTS speaks)
      //    We use a lower threshold and high ratio to ensure significant ducking
      `[0:a][1:a]sidechaincompress=threshold=-40dB:ratio=20:attack=5:release=200[ducked_original]`,
      // 2. Mix the ducked original with the TTS audio
      //    normalize=0 keeps the original volume levels (instead of dropping by 6dB)
      //    This satisfies "original audio should be the same volume when TTS is not overlayed"
      `[ducked_original][1:a]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[mixed]`,
      // 3. Add a limiter to prevent any residual clipping on the final output
      `[mixed]alimiter=limit=0.95:attack=5:release=50:asc=1`
    ])
      .audioCodec('flac')
      .audioFrequency(48000)
      .audioChannels(2)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('error', (err: any) => {
        console.error(`[AUDIO] FFmpeg error applying sidechain compression:`, err);
        reject(new Error(`FFmpeg error: ${err.message}`));
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('end', () => {
        const duration = Date.now() - startTime;
        console.log(`[AUDIO] Sidechain compression completed in ${duration}ms: ${outputPath}`);
        resolve();
      })
      .save(outputPath);

      console.log("[FFMPEG AUDIO] Command: " + command.toString());
  });
}

/**
 * Get audio file duration in seconds
 */
export async function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(new Error(`FFprobe error: ${err.message}`));
      } else {
        const duration = metadata.format.duration || 0;
        resolve(duration);
      }
    });
  });
}

/**
 * Convert audio file to WAV format
 */
export async function convertAudioToWav(
  inputPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ffmpegAny(inputPath)
      .audioCodec('pcm_s16le')
      .audioFrequency(44100)
      .audioChannels(2)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('error', (err: any) => {
        reject(new Error(`FFmpeg error: ${err.message}`));
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('end', () => {
        resolve();
      })
      .save(outputPath);
  });
}

/**
 * Normalize audio volume
 */
export async function normalizeAudio(
  inputPath: string,
  outputPath: string,
  targetLevel: number = -16 // dB
): Promise<void> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ffmpegAny(inputPath)
      .audioFilter(`loudnorm=I=${targetLevel}:TP=-1.5:LRA=11`)
      .audioCodec('libmp3lame')
      .audioFrequency(44100)
      .audioChannels(2)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('error', (err: any) => {
        reject(new Error(`FFmpeg error: ${err.message}`));
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('end', () => {
        resolve();
      })
      .save(outputPath);
  });
}

/**
 * Adjust audio playback speed using FFmpeg's atempo filter
 * Supports speed adjustments beyond the 0.5x-2.0x limit by chaining filters
 */
export async function adjustAudioSpeed(
  inputPath: string,
  outputPath: string,
  targetSpeed: number
): Promise<void> {
  console.log(`[AUDIO] Adjusting audio speed: ${targetSpeed.toFixed(2)}x -> ${outputPath}`);
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    // FFmpeg's atempo filter only supports 0.5 to 2.0
    // For speeds outside this range, we chain multiple atempo filters
    const filters: string[] = [];
    let remainingSpeed = targetSpeed;

    // Chain atempo filters until we reach the target speed
    while (Math.abs(remainingSpeed - 1.0) > 0.01) {
      let tempo: number;
      
      if (remainingSpeed > 2.0) {
        tempo = 2.0;
        remainingSpeed /= 2.0;
      } else if (remainingSpeed < 0.5) {
        tempo = 0.5;
        remainingSpeed /= 0.5;
      } else {
        tempo = remainingSpeed;
        remainingSpeed = 1.0;
      }

      filters.push(`atempo=${tempo.toFixed(3)}`);
    }

    // If no filters needed (speed is ~1.0), just copy the file
    if (filters.length === 0) {
      fs.copyFile(inputPath, outputPath)
        .then(() => {
          const duration = Date.now() - startTime;
          console.log(`[AUDIO] No speed adjustment needed (1.0x), copied in ${duration}ms`);
          resolve();
        })
        .catch(reject);
      return;
    }

    // Build filter chain
    const filterChain = filters.join(',');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ffmpegAny(inputPath)
      .audioFilter(filterChain)
      .audioCodec('pcm_s16le')
      .audioFrequency(44100)
      .audioChannels(2)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('error', (err: any) => {
        console.error(`[AUDIO] FFmpeg error adjusting speed:`, err);
        reject(new Error(`FFmpeg error: ${err.message}`));
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('end', () => {
        const duration = Date.now() - startTime;
        console.log(`[AUDIO] Speed adjusted to ${targetSpeed.toFixed(2)}x in ${duration}ms`);
        resolve();
      })
      .save(outputPath);
  });
}

/**
 * Trim trailing silence from an audio file
 * Uses silenceremove filter to detect and remove silence at the end
 */
export async function trimTrailingSilence(
  inputPath: string,
  outputPath: string,
  options?: {
    silenceThreshold?: number; // dB threshold for silence detection (default: -50)
    minSilenceDuration?: number; // Minimum silence duration to detect (default: 0.1s)
  }
): Promise<void> {
  const threshold = options?.silenceThreshold ?? -50;
  const minDuration = options?.minSilenceDuration ?? 0.1;
  
  console.log(`[AUDIO] Trimming trailing silence from ${inputPath}`);
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    // silenceremove filter: 
    // stop_periods=1 - detect one silence period at the end
    // stop_duration - minimum silence duration to detect
    // stop_threshold - amplitude threshold for silence (dB)
    // detection=peak - use peak detection
    ffmpegAny(inputPath)
      .audioFilter(`silenceremove=stop_periods=1:stop_duration=${minDuration}:stop_threshold=${threshold}dB:detection=peak`)
      .audioCodec('pcm_s16le')
      .audioFrequency(44100)
      .audioChannels(2)
      .on('error', (err: any) => {
        console.error(`[AUDIO] FFmpeg error trimming silence:`, err);
        reject(new Error(`FFmpeg error: ${err.message}`));
      })
      .on('end', () => {
        const duration = Date.now() - startTime;
        console.log(`[AUDIO] Trimmed trailing silence in ${duration}ms`);
        resolve();
      })
      .save(outputPath);
  });
}

/**
 * Check if FFmpeg is available
 */
export async function checkFFmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    ffmpegAny.getAvailableFormats((err: any, formats: any) => {
      resolve(!err && !!formats);
    });
  });
}

