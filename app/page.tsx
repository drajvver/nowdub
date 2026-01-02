'use client';

import Link from 'next/link';
import { useConvexAuth } from 'convex/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';

export default function LandingPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, isLoading, router]);

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white overflow-hidden">
      {/* Background pattern */}
      <div className="fixed inset-0 opacity-30">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#008bd2]/20 via-white dark:via-black to-white dark:to-black" />
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23008bd2' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />
      </div>

      {/* Navigation */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 lg:px-12">
        <div className="text-2xl font-bold tracking-tight">
          <span className="text-[#008bd2]">Now</span>
          <span className="text-gray-900 dark:text-white">Dub</span>
        </div>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          {isLoading ? (
            <div className="w-8 h-8 rounded-full border-2 border-[#008bd2] border-t-transparent animate-spin" />
          ) : isAuthenticated ? (
            <Link
              href="/dashboard"
              className="px-5 py-2.5 bg-[#008bd2] hover:bg-[#0070a8] text-white font-semibold 
                rounded-xl transition-all duration-200 shadow-lg shadow-[#008bd2]/25"
            >
              Go to Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="px-5 py-2.5 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white font-medium transition-colors"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="px-5 py-2.5 bg-[#008bd2] hover:bg-[#0070a8] text-white font-semibold 
                  rounded-xl transition-all duration-200 shadow-lg shadow-[#008bd2]/25"
              >
                Get Started
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10">
        <section className="max-w-6xl mx-auto px-6 pt-20 pb-32 lg:pt-32">
          <div className="text-center space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#008bd2]/10 border border-[#008bd2]/20 rounded-full">
              <span className="w-2 h-2 bg-[#008bd2] rounded-full animate-pulse" />
              <span className="text-sm text-[#008bd2] font-medium">AI-Powered Dubbing</span>
            </div>
            
            <h1 className="text-5xl lg:text-7xl font-bold leading-tight">
              <span className="block">Transform Your Audio</span>
              <span className="block mt-2 bg-gradient-to-r from-[#008bd2] via-[#00a8e6] to-[#008bd2] bg-clip-text text-transparent">
                With AI Dubbing
              </span>
            </h1>
            
            <p className="max-w-2xl mx-auto text-xl text-gray-600 dark:text-gray-400 leading-relaxed">
              Upload your subtitles and audio files, and let our AI generate perfectly synchronized 
              dubbing that blends seamlessly with your original track.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              {!isAuthenticated && !isLoading && (
                <>
                  <Link
                    href="/register"
                    className="w-full sm:w-auto px-8 py-4 bg-[#008bd2] hover:bg-[#0070a8] text-white 
                      font-bold text-lg rounded-xl transition-all duration-200 
                      shadow-xl shadow-[#008bd2]/30 hover:shadow-[#008bd2]/40 hover:scale-105"
                  >
                    Start Free
                  </Link>
                  <Link
                    href="/login"
                    className="w-full sm:w-auto px-8 py-4 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-900 dark:text-white 
                      font-semibold text-lg rounded-xl transition-all duration-200 border border-gray-300 dark:border-gray-700"
                  >
                    Sign in
                  </Link>
                </>
              )}
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="max-w-6xl mx-auto px-6 pb-32">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="group bg-gray-100/50 dark:bg-gray-900/50 border border-gray-300 dark:border-gray-800 rounded-2xl p-8 hover:border-[#008bd2]/30 transition-all duration-300">
              <div className="w-14 h-14 bg-[#008bd2]/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-[#008bd2]/20 transition-colors">
                <svg className="w-7 h-7 text-[#008bd2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">Easy Upload</h3>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                Simply upload your subtitle file (.srt or .vtt) and audio track. We support all major audio formats.
              </p>
            </div>

            <div className="group bg-gray-100/50 dark:bg-gray-900/50 border border-gray-300 dark:border-gray-800 rounded-2xl p-8 hover:border-[#008bd2]/30 transition-all duration-300">
              <div className="w-14 h-14 bg-[#008bd2]/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-[#008bd2]/20 transition-colors">
                <svg className="w-7 h-7 text-[#008bd2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">AI-Powered TTS</h3>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                Our advanced text-to-speech engine generates natural-sounding voiceovers that match your subtitle timing.
              </p>
            </div>

            <div className="group bg-gray-100/50 dark:bg-gray-900/50 border border-gray-300 dark:border-gray-800 rounded-2xl p-8 hover:border-[#008bd2]/30 transition-all duration-300">
              <div className="w-14 h-14 bg-[#008bd2]/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-[#008bd2]/20 transition-colors">
                <svg className="w-7 h-7 text-[#008bd2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">Smart Mixing</h3>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                Automatic sidechain compression ducks your original audio when dubbing plays, creating professional results.
              </p>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="max-w-6xl mx-auto px-6 pb-32">
          <h2 className="text-3xl lg:text-4xl font-bold text-center mb-16 text-gray-900 dark:text-white">
            How It <span className="text-[#008bd2]">Works</span>
          </h2>
          <div className="grid md:grid-cols-4 gap-8">
            {[
              { step: '01', title: 'Upload', desc: 'Add your subtitle and audio files' },
              { step: '02', title: 'Process', desc: 'Our AI generates the voiceover' },
              { step: '03', title: 'Mix', desc: 'Smart audio mixing is applied' },
              { step: '04', title: 'Download', desc: 'Get your dubbed audio file' },
            ].map((item, i) => (
              <div key={i} className="text-center">
                <div className="text-5xl font-bold text-[#008bd2]/20 mb-4">{item.step}</div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{item.title}</h3>
                <p className="text-gray-600 dark:text-gray-400">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA Section */}
        {!isAuthenticated && !isLoading && (
          <section className="max-w-4xl mx-auto px-6 pb-32">
            <div className="bg-gradient-to-br from-[#008bd2]/10 to-[#008bd2]/5 border border-[#008bd2]/20 rounded-3xl p-12 text-center">
              <h2 className="text-3xl lg:text-4xl font-bold mb-4 text-gray-900 dark:text-white">
                Ready to transform your audio?
              </h2>
              <p className="text-xl text-gray-600 dark:text-gray-400 mb-8">
                Join NowDub today and start creating professional dubbing in minutes.
              </p>
              <Link
                href="/register"
                className="inline-flex px-8 py-4 bg-[#008bd2] hover:bg-[#0070a8] text-white 
                  font-bold text-lg rounded-xl transition-all duration-200 
                  shadow-xl shadow-[#008bd2]/30 hover:shadow-[#008bd2]/40"
              >
                Get Started for Free
              </Link>
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-gray-300 dark:border-gray-800 py-8">
        <div className="max-w-6xl mx-auto px-6 text-center text-gray-600 dark:text-gray-500">
          <p>&copy; {new Date().getFullYear()} NowDub. AI-Powered Dubbing Generator.</p>
        </div>
      </footer>
    </div>
  );
}
