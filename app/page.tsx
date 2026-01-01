'use client';

import { useState, useEffect } from 'react';
import { JobStatusResponse } from '@/lib/types';

interface UploadFormData {
  subtitle: File | null;
  audio: File | null;
}

export default function Home() {
  const [formData, setFormData] = useState<UploadFormData>({
    subtitle: null,
    audio: null,
  });
  const [uploading, setUploading] = useState(false);
  const [jobs, setJobs] = useState<JobStatusResponse[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Poll for job updates
  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const response = await fetch('/api/jobs');
        if (response.ok) {
          const data = await response.json();
          setJobs(data);
        }
      } catch (err) {
        console.error('Error fetching jobs:', err);
      }
    };

    fetchJobs();
    const interval = setInterval(fetchJobs, 2000); // Poll every 2 seconds

    return () => clearInterval(interval);
  }, []);

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

    setUploading(true);
    setError(null);

    try {
      const formDataToSend = new FormData();
      formDataToSend.append('subtitle', formData.subtitle);
      formDataToSend.append('audio', formData.audio);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formDataToSend,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Upload failed');
      }

      const data = await response.json();
      setFormData({ subtitle: null, audio: null });

      // Refresh jobs
      const jobsResponse = await fetch('/api/jobs');
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
    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: 'DELETE',
      });

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
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'processing':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'failed':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black font-sans">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <header className="mb-12 text-center">
          <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-50 mb-4">
            Auto Dubbing Generator
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            Generate TTS audio from subtitles and merge with your original audio track
          </p>
        </header>

        <section className="bg-white dark:bg-zinc-900 rounded-lg shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-6">
            Upload Files
          </h2>

          <form onSubmit={handleUpload} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Subtitle File (.srt or .vtt)
              </label>
              <input
                type="file"
                accept=".srt,.vtt"
                onChange={(e) => handleFileChange('subtitle', e.target.files?.[0] || null)}
                className="block w-full text-sm text-zinc-500 dark:text-zinc-400
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-full file:border-0
                  file:text-sm file:font-semibold
                  file:bg-zinc-100 dark:file:bg-zinc-800
                  file:text-zinc-700 dark:file:text-zinc-300
                  hover:file:bg-zinc-200 dark:hover:file:bg-zinc-700
                  cursor-pointer"
              />
              {formData.subtitle && (
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  Selected: {formData.subtitle.name}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Audio File (.mp3, .wav, .m4a, .aac, .ogg, .flac, .wma)
              </label>
              <input
                type="file"
                accept=".mp3,.wav,.m4a,.aac,.ogg,.flac,.wma"
                onChange={(e) => handleFileChange('audio', e.target.files?.[0] || null)}
                className="block w-full text-sm text-zinc-500 dark:text-zinc-400
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-full file:border-0
                  file:text-sm file:font-semibold
                  file:bg-zinc-100 dark:file:bg-zinc-800
                  file:text-zinc-700 dark:file:text-zinc-300
                  hover:file:bg-zinc-200 dark:hover:file:bg-zinc-700
                  cursor-pointer"
              />
              {formData.audio && (
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  Selected: {formData.audio.name}
                </p>
              )}
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={uploading || !formData.subtitle || !formData.audio}
              className="w-full py-3 px-4 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900
                rounded-lg font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200
                disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {uploading ? 'Uploading...' : 'Start Processing'}
            </button>
          </form>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-6">
            Jobs
          </h2>

          {jobs.length === 0 ? (
            <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-lg p-8 text-center">
              <p className="text-zinc-600 dark:text-zinc-400">No jobs yet. Upload files to get started.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="bg-white dark:bg-zinc-900 rounded-lg shadow-lg p-6"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(job.status)}`}
                        >
                          {job.status}
                        </span>
                        <span className="text-sm text-zinc-500 dark:text-zinc-400">
                          {formatDate(job.createdAt)}
                        </span>
                      </div>

                      {job.status === 'processing' && job.progress !== undefined && (
                        <div className="mb-3">
                          <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${job.progress}%` }}
                            />
                          </div>
                          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                            {job.progress}% complete
                          </p>
                        </div>
                      )}

                      {job.error && (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-3">
                          <p className="text-sm text-red-800 dark:text-red-200">{job.error}</p>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => handleDeleteJob(job.id)}
                      className="text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                      title="Delete job"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
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
                    <div className="flex flex-wrap gap-3">
                      {job.downloads.ttsAudio && (
                        <a
                          href={job.downloads.ttsAudio}
                          download
                          className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-100 dark:bg-zinc-800
                            text-zinc-700 dark:text-zinc-300 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700
                            transition-colors text-sm font-medium"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                            />
                          </svg>
                          Download TTS Audio
                        </a>
                      )}
                      {job.downloads.mergedAudio && (
                        <a
                          href={job.downloads.mergedAudio}
                          download
                          className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 dark:bg-zinc-100
                            text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200
                            transition-colors text-sm font-medium"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                            />
                          </svg>
                          Download Merged Audio
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
    </div>
  );
}
