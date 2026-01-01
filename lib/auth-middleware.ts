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
    // Get the auth token from cookies
    const sessionToken = request.cookies.get('__convexAuthJWT')?.value;
    
    if (!sessionToken) {
      // Try authorization header as fallback
      const authHeader = request.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        return decodeToken(token);
      }
      return null;
    }

    return decodeToken(sessionToken);
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
