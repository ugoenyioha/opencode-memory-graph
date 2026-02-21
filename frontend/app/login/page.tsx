'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Database, AlertCircle } from '@/components/icons';

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  const errorMessages: Record<string, string> = {
    access_denied: 'Access was denied. Please try again.',
    state: 'Invalid OAuth state. Please try again.',
    exchange: 'Failed to complete authentication. Please try again.',
    profile: 'Failed to fetch user profile. Please try again.',
    unauthorized: 'You are not authorized to access this application.',
  };

  const errorMessage = error ? errorMessages[error] || 'An error occurred. Please try again.' : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-theme-bg">
      <div className="text-center p-10 bg-theme-bg-secondary/50 border border-theme-border-dim rounded-2xl max-w-md w-full mx-4">
        <div className="w-16 h-16 rounded-2xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center mx-auto mb-6">
          <Database className="w-8 h-8 text-purple-400" />
        </div>

        <h1 className="text-2xl font-semibold text-theme-text mb-2">CXDB</h1>
        <p className="text-theme-text-dim mb-8">AI Context Store - Authenticated Access</p>

        {errorMessage && (
          <div className="flex items-center gap-2 justify-center text-red-400 text-sm mb-6 p-3 bg-red-600/10 border border-red-500/20 rounded-lg">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <a
          href="/auth/google/login"
          className="inline-flex items-center gap-3 px-6 py-3 bg-white hover:bg-gray-100 text-gray-900 font-medium rounded-lg transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path
              fill="#4285F4"
              d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
            />
            <path
              fill="#34A853"
              d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"
            />
            <path
              fill="#FBBC05"
              d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"
            />
            <path
              fill="#EA4335"
              d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
            />
          </svg>
          Sign in with Google
        </a>

        <p className="text-xs text-theme-text-faint mt-8">
          Access restricted to authorized users only.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-theme-bg">
        <div className="text-theme-text-dim">Loading...</div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
