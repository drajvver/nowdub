import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

/**
 * Get a Convex client for server-side use
 * This client can be used in API routes and server components
 */
export function getConvexClient() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL environment variable is not set");
  }
  
  return new ConvexHttpClient(convexUrl);
}

/**
 * Get a Convex client with authentication token
 * Use this when you need to make authenticated requests
 */
export function getConvexClientWithAuth(token: string) {
  const client = getConvexClient();
  client.setAuth(token);
  return client;
}

export { api };


