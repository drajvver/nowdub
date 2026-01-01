export interface SubtitleSegment {
  start: number; // seconds
  end: number; // seconds
  text: string;
}

export interface SilenceGap {
  start: number;
  duration: number;
}

export interface TTSOptions {
  languageCode?: string;
  voiceName?: string;
  audioEncoding?: 'LINEAR16' | 'MP3' | 'OGG_OPUS';
  speakingRate?: number;
  pitch?: number;
}

export interface DubbingJob {
  id: string; // Convex ID
  userId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  error?: string;
  files: {
    subtitle: string;
    originalAudio: string;
    ttsAudio?: string;
    mergedAudio?: string;
  };
  createdAt: Date;
  completedAt?: Date;
}

export interface UploadResponse {
  jobId: string;
  message: string;
}

export interface JobStatusResponse {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  error?: string;
  createdAt: string;
  completedAt?: string;
  downloads?: {
    ttsAudio?: string;
    mergedAudio?: string;
  };
}
