'use client';

import { useConvexAuth } from 'convex/react';
import { useEffect, useState } from 'react';

/**
 * Hook to get the Convex authentication token for use in API calls
 * 
 * Convex Auth stores the JWT in a cookie that's managed by the Convex client.
 * For Next.js API routes to access it, we need to extract and pass it manually.
 */
export function useConvexAuthToken() {
  const { isAuthenticated } = useConvexAuth();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (isAuthenticated) {
      console.log('[AUTH TOKEN] Attempting to retrieve token...');
      console.log('[AUTH TOKEN] All cookies:', document.cookie);
      console.log('[AUTH TOKEN] LocalStorage keys:', Object.keys(localStorage));
      
      // The token is stored in a cookie by Convex
      // We need to extract it from the document.cookie
      const cookies = document.cookie.split(';');
      
      // Look for the Convex auth JWT cookie
      // The cookie name pattern is based on the Convex deployment
      for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name.includes('convex') && name.toLowerCase().includes('jwt')) {
          console.log('[AUTH TOKEN] Found JWT in cookie:', name);
          setToken(decodeURIComponent(value));
          return;
        }
      }
      
      // If not found in cookies, check localStorage as fallback
      try {
        const storageKeys = Object.keys(localStorage);
        for (const key of storageKeys) {
          if (key.includes('convex') && key.toLowerCase().includes('auth')) {
            console.log('[AUTH TOKEN] Found auth in localStorage:', key);
            const data = localStorage.getItem(key);
            if (data) {
              try {
                // Try parsing as JSON first
                const parsed = JSON.parse(data);
                console.log('[AUTH TOKEN] Parsed data keys:', Object.keys(parsed));
                if (parsed.token) {
                  setToken(parsed.token);
                  return;
                }
              } catch {
                // If JSON parsing fails, the value might be a raw JWT token string
                console.log('[AUTH TOKEN] Data is not JSON, treating as raw token');
                // Check if it looks like a JWT (3 parts separated by dots)
                if (data.includes('.') && data.split('.').length === 3) {
                  console.log('[AUTH TOKEN] Found raw JWT token in localStorage');
                  setToken(data);
                  return;
                }
              }
            }
          }
        }
      } catch (e) {
        console.error('Failed to get convex auth token:', e);
      }
      
      console.log('[AUTH TOKEN] No token found');
      setToken(null);
    } else {
      setToken(null);
    }
  }, [isAuthenticated]);

  return token;
}

/**
 * Helper function to create fetch options with auth headers
 */
export function createAuthFetchOptions(
  token: string | null,
  options: RequestInit = {}
): RequestInit {
  const headers = new Headers(options.headers);
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  return {
    ...options,
    headers,
  };
}

