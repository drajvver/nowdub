#!/bin/sh
set -e

# Replace placeholder environment variables in the built Next.js files
# This allows runtime configuration of NEXT_PUBLIC_* variables

echo "Injecting runtime environment variables..."

# Find all JS files in .next and replace placeholders
find /app/.next -type f -name "*.js" -exec sed -i \
  -e "s|__NEXT_PUBLIC_CONVEX_URL_PLACEHOLDER__|${NEXT_PUBLIC_CONVEX_URL:-}|g" \
  -e "s|__NEXT_PUBLIC_API_URL_PLACEHOLDER__|${NEXT_PUBLIC_API_URL:-}|g" \
  {} +

echo "Environment variables injected successfully"

# Execute the main command
exec "$@"

