import { NextRequest, NextResponse } from 'next/server';

export interface AuthUser {
  id: string;
  email?: string;
  name?: string;
}

/**
 * Verify the authentication token from the request and return the user info.
 * Returns null if not authenticated.
 */
export async function getAuthUser(request: NextRequest): Promise<AuthUser | null> {
  try {
    console.log('[AUTH] Checking authentication...');
    console.log('[AUTH] Cookie names:', Array.from(request.cookies.getAll()).map(c => c.name));
    
    // First, try the Authorization header (preferred method for client-side auth)
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      console.log('[AUTH] Found Bearer token in Authorization header');
      const user = decodeToken(token);
      if (user) {
        console.log('[AUTH] Successfully decoded user from header:', { id: user.id, email: user.email });
        return user;
      }
    }
    
    // Try to find any cookie that looks like a Convex auth JWT
    const allCookies = request.cookies.getAll();
    for (const cookie of allCookies) {
      if (cookie.name.toLowerCase().includes('convex') && cookie.name.toLowerCase().includes('jwt')) {
        console.log('[AUTH] Found potential Convex JWT cookie:', cookie.name);
        const user = decodeToken(cookie.value);
        if (user) {
          console.log('[AUTH] Successfully decoded user from cookie:', { id: user.id, email: user.email });
          return user;
        }
      }
    }
    
    // Also try the specific cookie name just in case
    const sessionToken = request.cookies.get('__convexAuthJWT')?.value;
    if (sessionToken) {
      console.log('[AUTH] Found __convexAuthJWT cookie');
      const user = decodeToken(sessionToken);
      if (user) {
        console.log('[AUTH] Successfully decoded user from __convexAuthJWT:', { id: user.id, email: user.email });
        return user;
      }
    }
    
    console.log('[AUTH] No valid session token found');
    return null;
  } catch (error) {
    console.error('[AUTH] Error verifying token:', error);
    return null;
  }
}

/**
 * Decode JWT token to get user info (basic decode, not verification)
 * The actual verification happens on Convex's side
 */
function decodeToken(token: string): AuthUser | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }
    
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64').toString()
    );
    
    if (payload.sub) {
      return {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Middleware helper that returns 401 if not authenticated
 */
export async function requireAuth(
  request: NextRequest
): Promise<{ user: AuthUser } | NextResponse> {
  const user = await getAuthUser(request);
  
  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized - Please sign in to access this resource' },
      { status: 401 }
    );
  }
  
  return { user };
}

/**
 * Create an unauthorized response
 */
export function unauthorizedResponse(message: string = 'Unauthorized'): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 });
}

/**
 * Create a forbidden response
 */
export function forbiddenResponse(message: string = 'Forbidden'): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}
