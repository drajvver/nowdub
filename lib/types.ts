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
  creditsUsed?: number;
  downloads?: {
    ttsAudio?: string;
    mergedAudio?: string;
  };
}

// Credit system types
export interface CreditTransaction {
  _id: string;
  userId: string;
  jobId?: string;
  amount: number;
  type: 'initial' | 'job_deduction' | 'admin_adjustment' | 'reservation' | 'reservation_release';
  description: string;
  createdAt: number;
}

export interface UserCredits {
  balance: number | null;
  reservedCredits?: number;
  availableBalance?: number | null;
  isInitialized: boolean;
  recentTransactions: CreditTransaction[];
}

export interface CreditEstimate {
  minCredits: number; // If all cache hits
  maxCredits: number; // If all cache misses
  lineCount: number;
}
