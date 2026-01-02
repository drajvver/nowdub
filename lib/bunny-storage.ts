import { promises as fs } from 'fs';
import { createReadStream } from 'fs';

// Bunny Storage configuration
const BUNNY_STORAGE_ZONE = 'dubber';
const BUNNY_STORAGE_URL = `https://storage.bunnycdn.com/${BUNNY_STORAGE_ZONE}`;
const BUNNY_CDN_URL = `https://${BUNNY_STORAGE_ZONE}.b-cdn.net`;

/**
 * Get the Bunny Storage API key from environment
 */
function getBunnyStorageKey(): string | null {
  const key = process.env.BUNNY_STORAGE_KEY;
  if (!key) {
    console.warn('[BUNNY] BUNNY_STORAGE_KEY not configured, uploads will be skipped');
    return null;
  }
  return key;
}

/**
 * Upload a file to Bunny Storage
 * @param localPath - Local file path to upload
 * @param storagePath - Path in Bunny Storage (e.g., "users/123/jobs/456/tts_audio.wav")
 * @returns CDN URL of the uploaded file, or null if upload failed
 */
export async function uploadFileToBunny(
  localPath: string,
  storagePath: string
): Promise<string | null> {
  const apiKey = getBunnyStorageKey();
  if (!apiKey) {
    return null;
  }

  try {
    // Stream the file to avoid loading entire file into memory
    const fileStream = createReadStream(localPath);

    // Upload to Bunny Storage
    const uploadUrl = `${BUNNY_STORAGE_URL}/${storagePath}`;
    console.log(`[BUNNY] Uploading ${localPath} to ${uploadUrl}`);

    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'AccessKey': apiKey,
        'Content-Type': 'application/octet-stream',
      },
      body: fileStream as any, // Stream directly instead of loading into memory
      duplex: 'half', // Required for Node.js fetch when sending a body
    } as RequestInit & { duplex: 'half' });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[BUNNY] Upload failed: ${response.status} ${response.statusText} - ${errorText}`);
      return null;
    }

    // Return CDN URL
    const cdnUrl = `${BUNNY_CDN_URL}/${storagePath}`;
    console.log(`[BUNNY] Upload successful: ${cdnUrl}`);
    return cdnUrl;
  } catch (error) {
    console.error(`[BUNNY] Upload error for ${localPath}:`, error);
    return null;
  }
}

/**
 * Upload job audio files to Bunny Storage
 * @param userId - User ID for path scoping
 * @param jobId - Job ID for path scoping
 * @param ttsAudioPath - Local path to TTS audio file
 * @param mergedAudioPath - Local path to merged audio file
 * @returns Object with CDN URLs for each file (null if upload failed)
 */
export async function uploadJobFilesToBunny(
  userId: string,
  jobId: string,
  ttsAudioPath: string,
  mergedAudioPath: string
): Promise<{
  ttsAudioUrl: string | null;
  mergedAudioUrl: string | null;
}> {
  // Create storage paths scoped by user and job
  const basePath = `users/${userId}/jobs/${jobId}`;

  // Upload both files in parallel
  const [ttsAudioUrl, mergedAudioUrl] = await Promise.all([
    uploadFileToBunny(ttsAudioPath, `${basePath}/tts_audio.wav`),
    uploadFileToBunny(mergedAudioPath, `${basePath}/merged_audio.flac`),
  ]);

  return { ttsAudioUrl, mergedAudioUrl };
}

/**
 * Delete a file from Bunny Storage
 * @param storagePath - Path in Bunny Storage
 * @returns true if deletion was successful
 */
export async function deleteFileFromBunny(storagePath: string): Promise<boolean> {
  const apiKey = getBunnyStorageKey();
  if (!apiKey) {
    return false;
  }

  try {
    const deleteUrl = `${BUNNY_STORAGE_URL}/${storagePath}`;
    console.log(`[BUNNY] Deleting ${deleteUrl}`);

    const response = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'AccessKey': apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[BUNNY] Delete failed: ${response.status} ${response.statusText} - ${errorText}`);
      return false;
    }

    console.log(`[BUNNY] Delete successful: ${storagePath}`);
    return true;
  } catch (error) {
    console.error(`[BUNNY] Delete error for ${storagePath}:`, error);
    return false;
  }
}

/**
 * Check if a URL is a Bunny CDN URL
 */
export function isBunnyCdnUrl(url: string): boolean {
  return url.startsWith(BUNNY_CDN_URL);
}

/**
 * Extract storage path from CDN URL
 */
export function getStoragePathFromCdnUrl(cdnUrl: string): string | null {
  if (!isBunnyCdnUrl(cdnUrl)) {
    return null;
  }
  return cdnUrl.replace(`${BUNNY_CDN_URL}/`, '');
}

