import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { TTSOptions } from './types';

// Cache directory path
const CACHE_DIR = path.join(process.cwd(), 'cache', 'tts');

/**
 * Initialize cache directory
 */
async function ensureCacheDir(): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

/**
 * Normalize text for cache key generation
 * Removes extra whitespace and normalizes to consistent format
 */
function normalizeText(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Generate cache key from text and TTS options
 * Excludes speakingRate as it will be handled via speed adjustment
 */
export function getCacheKey(text: string, options?: TTSOptions): string {
  const normalizedText = normalizeText(text);
  
  // Create a string with all cache-relevant options
  const keyData = JSON.stringify({
    text: normalizedText,
    languageCode: options?.languageCode || 'pl-PL',
    voiceName: options?.voiceName || 'pl-PL-Standard-G',
    audioEncoding: options?.audioEncoding || 'MP3',
    pitch: options?.pitch || 0.0,
  });
  
  // Generate SHA-256 hash
  return crypto.createHash('sha256').update(keyData).digest('hex');
}

/**
 * Get the full file path for a cache key
 */
export function getCachePath(cacheKey: string): string {
  return path.join(CACHE_DIR, `${cacheKey}.mp3`);
}

/**
 * Check if cached audio exists for a given cache key
 * Returns the file path if exists, null otherwise
 */
export async function getCachedAudio(cacheKey: string): Promise<string | null> {
  const cachePath = getCachePath(cacheKey);
  
  try {
    await fs.access(cachePath);
    return cachePath;
  } catch {
    return null;
  }
}

/**
 * Save generated audio to cache
 */
export async function saveCachedAudio(
  cacheKey: string,
  audioBuffer: Buffer
): Promise<void> {
  await ensureCacheDir();
  
  const cachePath = getCachePath(cacheKey);
  await fs.writeFile(cachePath, audioBuffer, 'binary');
  
  console.log(`[CACHE] Saved audio to cache: ${cacheKey}`);
}

/**
 * Copy cached audio to output path
 */
export async function copyCachedAudio(
  cacheKey: string,
  outputPath: string
): Promise<void> {
  const cachePath = getCachePath(cacheKey);
  
  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  await fs.mkdir(outputDir, { recursive: true });
  
  // Copy cached file to output
  await fs.copyFile(cachePath, outputPath);
  
  console.log(`[CACHE] Copied cached audio: ${cacheKey} -> ${outputPath}`);
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  count: number;
  totalSize: number;
}> {
  try {
    await ensureCacheDir();
    const files = await fs.readdir(CACHE_DIR);
    
    let totalSize = 0;
    for (const file of files) {
      const filePath = path.join(CACHE_DIR, file);
      const stats = await fs.stat(filePath);
      totalSize += stats.size;
    }
    
    return {
      count: files.length,
      totalSize,
    };
  } catch {
    return { count: 0, totalSize: 0 };
  }
}

/**
 * Clear all cached audio files
 */
export async function clearCache(): Promise<void> {
  try {
    const files = await fs.readdir(CACHE_DIR);
    
    for (const file of files) {
      const filePath = path.join(CACHE_DIR, file);
      await fs.unlink(filePath);
    }
    
    console.log(`[CACHE] Cleared ${files.length} cached files`);
  } catch (error) {
    console.error('[CACHE] Error clearing cache:', error);
    throw error;
  }
}

