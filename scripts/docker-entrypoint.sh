#!/bin/sh
set -e

# Replace placeholder environment variables in the built Next.js files
# This allows runtime configuration of NEXT_PUBLIC_* variables

echo "Injecting runtime environment variables..."

# Find all JS files in .next and replace placeholders
find /app/.next -type f -name "*.js" -exec sed -i \
  -e "s|https://PLACEHOLDER_CONVEX_URL.convex.cloud|${NEXT_PUBLIC_CONVEX_URL:-https://PLACEHOLDER_CONVEX_URL.convex.cloud}|g" \
  -e "s|https://PLACEHOLDER_API_URL.example.com|${NEXT_PUBLIC_API_URL:-https://PLACEHOLDER_API_URL.example.com}|g" \
  {} +

echo "Environment variables injected successfully"

# Execute the main command
exec "$@"

