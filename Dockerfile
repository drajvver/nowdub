# Stage 1: Build stage
FROM node:20-slim AS builder

# Install FFmpeg (needed for build-time checks)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Use placeholder values for NEXT_PUBLIC_ environment variables at build time
# These will be replaced at runtime by docker-entrypoint.sh
# Using valid URL format to pass build-time validation
ENV NEXT_PUBLIC_CONVEX_URL=https://PLACEHOLDER_CONVEX_URL.convex.cloud
ENV NEXT_PUBLIC_API_URL=https://PLACEHOLDER_API_URL.example.com

# Copy package files
COPY package.json package-lock.json* ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy application code
COPY . .

# Build Next.js application
RUN npm run build

# Stage 2: Production stage
FROM node:20-slim AS runner

# Install FFmpeg (required at runtime for audio processing)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Set environment to production
ENV NODE_ENV=production

# Create a non-root user for security with home directory
RUN groupadd -r nodejs && useradd -r -g nodejs -m -d /home/nodejs nodejs

# Copy package files
COPY package.json package-lock.json* ./

# Install production dependencies
RUN npm ci --only=production && npm cache clean --force

# Install TypeScript as a production dependency (Next.js needs it at runtime for next.config.ts)
# We install it separately to ensure it's available even though it's technically a dev tool
RUN npm install typescript@^5 --no-save && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/tsconfig.json ./
# Copy source files needed at runtime (API routes, lib, etc.)
COPY --from=builder /app/app ./app
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/convex ./convex
COPY --from=builder /app/types ./types

# Copy entrypoint script for runtime environment variable injection
COPY scripts/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Create directories for temp files and cache
# Set ownership before switching users (including node_modules)
RUN mkdir -p temp/jobs cache/tts && \
    chown -R nodejs:nodejs /app && \
    chown -R nodejs:nodejs /home/nodejs

# Switch to non-root user
USER nodejs

# Expose port 3000
EXPOSE 3000

# Use entrypoint script to inject runtime environment variables
ENTRYPOINT ["/docker-entrypoint.sh"]

# Start the Next.js production server
CMD ["npm", "start"]

