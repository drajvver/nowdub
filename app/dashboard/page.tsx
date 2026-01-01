'use client';

import { useState, useEffect, useRef } from 'react';
import { JobStatusResponse } from '@/lib/types';
import { useConvexAuthToken, createAuthFetchOptions } from '@/lib/use-convex-auth-token';

interface UploadFormData {
  subtitle: File | null;
  audio: File | null;
}

export default function DashboardPage() {
  const token = useConvexAuthToken();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [formData, setFormData] = useState<UploadFormData>({
    subtitle: null,
    audio: null,
  });
  const [uploading, setUploading] = useState(false);
  const [jobs, setJobs] = useState<JobStatusResponse[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Poll for job updates with dynamic interval
  useEffect(() => {
    if (!token) return; // Wait for token
    
    const fetchJobs = async () => {
      try {
        const response = await fetch('/api/jobs', createAuthFetchOptions(token, {
          credentials: 'include',
        }));
        if (response.ok) {
          const data = await response.json();
          setJobs(data);
          
          // Determine next polling interval based on job status
          const hasActiveJobs = data.some((job: JobStatusResponse) => 
            job.status === 'pending' || job.status === 'processing'
          );
          
          // Schedule next poll: 2 seconds if active jobs, 60 seconds otherwise
          const nextInterval = hasActiveJobs ? 2000 : 60000;
          timeoutRef.current = setTimeout(fetchJobs, nextInterval);
        }
      } catch (err) {
        console.error('Error fetching jobs:', err);
        // Retry after 5 seconds on error
        timeoutRef.current = setTimeout(fetchJobs, 5000);
      }
    };

    // Start initial fetch
    fetchJobs();

    // Cleanup function
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [token]);

  const handleFileChange = (type: 'subtitle' | 'audio', file: File | null) => {
    setFormData((prev) => ({ ...prev, [type]: file }));
    setError(null);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.subtitle || !formData.audio) {
      setError('Please select both a subtitle file and an audio file');
      return;
    }

    if (!token) {
      setError('Authentication token not available. Please try logging in again.');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formDataToSend = new FormData();
      formDataToSend.append('subtitle', formData.subtitle);
      formDataToSend.append('audio', formData.audio);

      const response = await fetch('/api/upload', createAuthFetchOptions(token, {
        method: 'POST',
        body: formDataToSend,
        credentials: 'include',
      }));

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Upload failed');
      }

      setFormData({ subtitle: null, audio: null });

      // Refresh jobs
      const jobsResponse = await fetch('/api/jobs', createAuthFetchOptions(token, {
        credentials: 'include',
      }));
      if (jobsResponse.ok) {
        const jobsData = await jobsResponse.json();
        setJobs(jobsData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    if (!token) return;
    
    try {
      const response = await fetch(`/api/jobs/${jobId}`, createAuthFetchOptions(token, {
        method: 'DELETE',
        credentials: 'include',
      }));

      if (response.ok) {
        setJobs((prev) => prev.filter((job) => job.id !== jobId));
      }
    } catch (err) {
      console.error('Error deleting job:', err);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      case 'processing':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'completed':
        return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'failed':
        return 'bg-red-500/20 text-red-300 border-red-500/30';
      default:
        return 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-10">
        <h1 className="text-3xl font-bold text-zinc-100 mb-2">Dashboard</h1>
        <p className="text-zinc-400">
          Upload your files and generate AI-powered dubbing
        </p>
      </header>

      {/* Upload Section */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8 mb-8">
        <h2 className="text-xl font-semibold text-zinc-100 mb-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          Upload Files
        </h2>

        <form onSubmit={handleUpload} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Subtitle File (.srt or .vtt)
            </label>
            <div className="relative">
              <input
                type="file"
                accept=".srt,.vtt"
                onChange={(e) => handleFileChange('subtitle', e.target.files?.[0] || null)}
                className="block w-full text-sm text-zinc-400
                  file:mr-4 file:py-2.5 file:px-4
                  file:rounded-xl file:border-0
                  file:text-sm file:font-medium
                  file:bg-amber-500/10 file:text-amber-400
                  hover:file:bg-amber-500/20
                  file:cursor-pointer cursor-pointer
                  file:transition-colors"
              />
            </div>
            {formData.subtitle && (
              <p className="mt-2 text-sm text-zinc-500 flex items-center gap-2">
                <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {formData.subtitle.name}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Audio File (.mp3, .wav, .m4a, .aac, .ogg, .flac, .wma)
            </label>
            <div className="relative">
              <input
                type="file"
                accept=".mp3,.wav,.m4a,.aac,.ogg,.flac,.wma"
                onChange={(e) => handleFileChange('audio', e.target.files?.[0] || null)}
                className="block w-full text-sm text-zinc-400
                  file:mr-4 file:py-2.5 file:px-4
                  file:rounded-xl file:border-0
                  file:text-sm file:font-medium
                  file:bg-amber-500/10 file:text-amber-400
                  hover:file:bg-amber-500/20
                  file:cursor-pointer cursor-pointer
                  file:transition-colors"
              />
            </div>
            {formData.audio && (
              <p className="mt-2 text-sm text-zinc-500 flex items-center gap-2">
                <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {formData.audio.name}
              </p>
            )}
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-800/50 rounded-xl p-4">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={uploading || !formData.subtitle || !formData.audio}
            className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-400 text-zinc-900
              rounded-xl font-semibold transition-all duration-200
              disabled:opacity-50 disabled:cursor-not-allowed
              shadow-lg shadow-amber-500/25 hover:shadow-amber-400/30"
          >
            {uploading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Processing...
              </span>
            ) : (
              'Start Processing'
            )}
          </button>
        </form>
      </section>

      {/* Jobs Section */}
      <section>
        <h2 className="text-xl font-semibold text-zinc-100 mb-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          Your Jobs
        </h2>

        {jobs.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
            <div className="w-16 h-16 mx-auto bg-zinc-800 rounded-2xl flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <p className="text-zinc-400">No jobs yet. Upload files to get started.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <span
                        className={`px-3 py-1 rounded-lg text-xs font-medium border ${getStatusColor(job.status)}`}
                      >
                        {job.status}
                      </span>
                      <span className="text-sm text-zinc-500">
                        {formatDate(job.createdAt)}
                      </span>
                    </div>

                    {job.status === 'processing' && job.progress !== undefined && (
                      <div className="mb-4">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-zinc-400">Progress</span>
                          <span className="text-zinc-300 font-medium">{Math.round(job.progress)}%</span>
                        </div>
                        <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-amber-500 to-amber-400 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${job.progress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {job.error && (
                      <div className="bg-red-900/20 border border-red-800/50 rounded-xl p-3 mb-4">
                        <p className="text-sm text-red-300">{job.error}</p>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => handleDeleteJob(job.id)}
                    className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                    title="Delete job"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>

                {job.status === 'completed' && job.downloads && (
                  <div className="flex flex-wrap gap-3 pt-2 border-t border-zinc-800">
                    {job.downloads.ttsAudio && (
                      <a
                        href={job.downloads.ttsAudio}
                        download
                        className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700
                          text-zinc-300 rounded-xl transition-colors text-sm font-medium"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                          />
                        </svg>
                        TTS Audio
                      </a>
                    )}
                    {job.downloads.mergedAudio && (
                      <a
                        href={job.downloads.mergedAudio}
                        download
                        className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400
                          text-zinc-900 rounded-xl transition-colors text-sm font-semibold
                          shadow-lg shadow-amber-500/25"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                          />
                        </svg>
                        Merged Audio
                      </a>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

