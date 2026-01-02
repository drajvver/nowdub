# NowDub - AI-Powered Dubbing Generator

An automatic dubbing generator application that uses Google Cloud Text-to-Speech to generate speech from SRT or VTT subtitles, then merges it with an original audio track using FFmpeg sidechain compression. Built with Next.js, Convex, and modern authentication.

## Features

### Core Functionality
- Upload SRT or VTT subtitle files
- Upload original audio tracks (MP3, WAV, M4A, AAC, OGG, FLAC, WMA)
- Generate TTS audio from subtitles with proper timing
- Merge TTS audio with original audio using sidechain compression
- Download both plain TTS audio and merged audio
- Asynchronous job processing with progress tracking
- Automatic file cleanup after processing

### User Features
- **User Authentication**: Secure password-based authentication using Convex Auth
- **User Dashboard**: Personalized dashboard to manage your dubbing jobs
- **Credits System**: Credit-based billing with transaction history
  - New users receive 100 free credits
  - 1 credit per new TTS line, 0.5 credits for cached lines
  - Credit reservation system prevents over-spending
  - Real-time credit balance and transaction history
- **Job Management**: 
  - Optional job naming
  - View job history and status
  - Delete jobs
  - Dynamic polling (2s for active jobs, 60s for inactive)
- **TTS Caching**: Intelligent caching system reduces costs by reusing previously generated audio
- **CDN Storage**: Files automatically uploaded to Bunny CDN for fast global delivery
- **Dark Mode**: Theme toggle for light/dark mode support
- **Credit Estimation**: Preview estimated cost before processing

### Infrastructure
- **Convex Backend**: Real-time database and backend functions
- **Bunny Storage**: CDN storage for generated audio files
- **InfluxDB Integration**: Character usage statistics tracking for Google Cloud TTS quota monitoring

## Prerequisites

Before running this application, ensure you have the following installed:

- **Node.js** (v18 or higher)
- **npm**, **yarn**, **pnpm**, or **bun**
- **FFmpeg** - Required for audio processing

### Installing FFmpeg

**Windows:**
```bash
# Using Chocolatey
choco install ffmpeg

# Or download from https://ffmpeg.org/download.html
```

**macOS:**
```bash
brew install ffmpeg
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install ffmpeg
```

Verify FFmpeg installation:
```bash
ffmpeg -version
```

## Google Cloud Setup

1. Create a Google Cloud project at [console.cloud.google.com](https://console.cloud.google.com)
2. Enable Cloud Text-to-Speech API:
   - Go to APIs & Services > Library
   - Search for "Cloud Text-to-Speech API"
   - Click "Enable"
3. Create a service account:
   - Go to IAM & Admin > Service Accounts
   - Click "Create Service Account"
   - Give it a name and click "Create and Continue"
   - Grant the "Cloud Text-to-Speech User" role
   - Click "Done"
4. Create a service account key:
   - Click on the service account you created
   - Go to the "Keys" tab
   - Click "Add Key" > "Create new key"
   - Select "JSON" and click "Create"
   - Save the JSON file securely

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd auto-lektor
```

2. Install dependencies:
```bash
npm install
# or
yarn install
# or
pnpm install
# or
bun install
```

3. Set up Convex:
```bash
npx convex dev
```
Follow the prompts to create a new Convex project or link to an existing one. This will generate your `NEXT_PUBLIC_CONVEX_URL`.

4. Set up environment variables:
```bash
cp env.example .env.local
```

5. Edit `.env.local` and configure the following:

**Required:**
```env
# Google Cloud Text-to-Speech
GOOGLE_APPLICATION_CREDENTIALS=/path/to/your/service-account-key.json

# Convex (generated from step 3)
NEXT_PUBLIC_CONVEX_URL=https://your-project.convex.cloud
```

**Optional (but recommended):**
```env
# Bunny Storage (for CDN file hosting)
BUNNY_STORAGE_KEY=your-bunny-storage-api-key

# InfluxDB (for TTS character usage statistics)
INFLUX_URL=http://localhost:8086
INFLUX_TOKEN=your-influxdb-token
INFLUX_ORG=your-organization
INFLUX_BUCKET=auto-lektor

# Optional: API key for statistics endpoint
STATS_API_KEY=your-secret-api-key
```

## Running the Application

The development server runs both Next.js and Convex concurrently:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

This will start:
- Convex backend (on port 3001 by default)
- Next.js frontend (on port 3000)

Open [http://localhost:3000](http://localhost:3000) in your browser.

**Note:** Make sure Convex is running (`npx convex dev`) before starting the dev server, or use the `npm run dev` command which starts both automatically.

## Usage

### Getting Started

1. **Register/Login**:
   - Visit the landing page at [http://localhost:3000](http://localhost:3000)
   - Click "Get Started" to create an account
   - Or click "Sign in" if you already have an account
   - New users automatically receive 100 free credits

2. **Upload Files**:
   - Navigate to the Dashboard
   - (Optional) Enter a job name, otherwise the audio filename will be used
   - Select a subtitle file (.srt or .vtt)
   - Select an audio file (.mp3, .wav, .m4a, .aac, .ogg, .flac, or .wma)
   - Review the credit estimate (shown before upload)
   - Click "Start Processing" (disabled if insufficient credits)

3. **Monitor Progress**:
   - Jobs are processed asynchronously
   - View job status and progress in the Dashboard
   - The page automatically polls for updates:
     - Every 2 seconds when there are active jobs
     - Every 60 seconds when no active jobs
   - Progress bar shows real-time processing status

4. **Download Results**:
   - Once a job is completed, download buttons will appear
   - "Download TTS Audio" - Plain generated speech audio (WAV format)
   - "Download Merged Audio" - TTS merged with original audio using sidechain compression (FLAC format)
   - Files are served from Bunny CDN for fast downloads

5. **Manage Credits**:
   - View your credit balance in the top-right corner
   - Click the credits display to view transaction history
   - Credits are deducted after job completion
   - Cached TTS lines cost 0.5 credits (50% savings)

6. **Manage Jobs**:
   - Delete jobs using the trash icon
   - Files are automatically cleaned up after processing
   - Job history is preserved in your dashboard

## Project Structure

```
app/
  (auth)/
    layout.tsx              # Auth layout wrapper
    login/
      page.tsx              # Login page
    register/
      page.tsx              # Registration page
  api/
    credits/
      route.ts              # Credit balance and transaction history
    jobs/
      route.ts              # List all jobs (user-scoped)
      [id]/
        route.ts            # Get/delete specific job
        download/
          route.ts          # Download generated files
    stats/
      characters/
        route.ts            # TTS character usage statistics
    upload/
      route.ts              # File upload endpoint
  dashboard/
    layout.tsx              # Dashboard layout with navigation
    page.tsx                # Main dashboard UI
  layout.tsx                # Root layout with Convex provider
  page.tsx                  # Landing page
  globals.css               # Global styles with dark mode
components/
  theme-toggle.tsx          # Dark/light mode toggle
convex/
  _generated/               # Auto-generated Convex types
  auth.config.ts            # Auth configuration
  auth.ts                   # Convex Auth setup
  credits.ts                # Credit management functions
  http.ts                   # HTTP endpoints for Convex
  jobs.ts                   # Job management functions
  schema.ts                 # Database schema
  users.ts                  # User management functions
lib/
  audio-processor.ts        # FFmpeg audio processing
  auth-middleware.ts        # API route authentication
  bunny-storage.ts          # Bunny CDN upload/download
  convex-provider.tsx      # Convex React provider wrapper
  convex-server-client.ts   # Server-side Convex client
  influx-stats.ts           # InfluxDB statistics tracking
  job-manager.ts            # Job queue management
  subtitle-parser.ts        # SRT/VTT parsing
  theme-provider.tsx        # Theme context provider
  tts-cache.ts              # TTS audio caching system
  tts-generator.ts          # Google Cloud TTS integration
  types.ts                  # TypeScript type definitions
  use-convex-auth-token.ts  # Hook for getting auth token
  use-user-credits.ts       # Hook for credit management
  utils.ts                  # Utility functions
cache/
  tts/                      # Local TTS audio cache
temp/
  jobs/                     # Temporary job files (cleaned up after processing)
```

## API Endpoints

All API endpoints require authentication via Bearer token in the `Authorization` header or Convex JWT cookie.

### POST /api/upload
Upload subtitle and audio files to create a new job.

**Headers:**
- `Authorization: Bearer <token>` (required)

**Request:** `multipart/form-data`
- `subtitle`: Subtitle file (.srt or .vtt) (required)
- `audio`: Audio file (required)
- `name`: Optional job name (optional)

**Response:**
```json
{
  "jobId": "uuid",
  "message": "Files uploaded successfully. Processing started."
}
```

**Errors:**
- `401`: Unauthorized (missing or invalid token)
- `400`: Missing files or insufficient credits
- `500`: Server error

### GET /api/jobs
List all jobs for the authenticated user.

**Headers:**
- `Authorization: Bearer <token>` (required)

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "My Dubbing Job",
    "status": "completed",
    "progress": 100,
    "createdAt": "2025-01-01T00:00:00.000Z",
    "completedAt": "2025-01-01T00:05:00.000Z",
    "creditsUsed": 45.5,
    "downloads": {
      "ttsAudio": "https://dubber.b-cdn.net/users/.../tts_audio.wav",
      "mergedAudio": "https://dubber.b-cdn.net/users/.../merged_audio.flac"
    }
  }
]
```

### GET /api/jobs/[id]
Get a specific job's status.

**Headers:**
- `Authorization: Bearer <token>` (required)

### DELETE /api/jobs/[id]
Delete a job and its files (including CDN files).

**Headers:**
- `Authorization: Bearer <token>` (required)

### GET /api/jobs/[id]/download?type=tts|merged
Download generated audio files. Works with both CDN URLs and local API URLs.

**Headers:**
- `Authorization: Bearer <token>` (required for API URLs, not needed for CDN URLs)

**Query Parameters:**
- `type`: Either `tts` or `merged` (required)

### GET /api/credits
Get user's credit balance and transaction history.

**Headers:**
- `Authorization: Bearer <token>` (required)

**Response:**
```json
{
  "balance": 100.0,
  "availableBalance": 95.5,
  "reservedCredits": 4.5,
  "transactions": [
    {
      "_id": "tx_id",
      "amount": -45.5,
      "type": "job_deduction",
      "description": "Deducted 45.5 credits (refunded 2.5) for job abc123",
      "jobId": "abc123",
      "createdAt": 1704067200000
    }
  ]
}
```

### POST /api/credits
Initialize user credits (called automatically on first access).

**Headers:**
- `Authorization: Bearer <token>` (required)

### GET /api/stats/characters
Get TTS character usage statistics (for monitoring Google Cloud quota).

**Query Parameters:**
- `days`: Number of days to query (default: 30, max: 365)
- `breakdown`: Include daily breakdown (default: false)

**Headers (optional):**
- `x-api-key`: API key if `STATS_API_KEY` is configured

**Response:**
```json
{
  "totalCharacters": 1500000,
  "limit": 4000000,
  "usagePercent": 37.5,
  "remaining": 2500000,
  "periodDays": 30,
  "dailyBreakdown": [
    {
      "date": "2025-01-01",
      "characters": 50000
    }
  ]
}
```

## Configuration

### TTS Settings

Default TTS settings are configured in `lib/tts-generator.ts`:
- Language: Polish (pl-PL)
- Voice: pl-PL-Standard-G
- Audio encoding: MP3
- Speaking rate: 1.0 (normal speed, adjusted per subtitle timing)
- Pitch: 0.0 (normal pitch)

To customize these settings, modify the `DEFAULT_TTS_OPTIONS` constant.

### Credits System

Credit settings are configured in `convex/credits.ts`:
- Initial credits: 100 (granted to new users)
- New TTS line: 1 credit
- Cached TTS line: 0.5 credits (50% discount)

### TTS Caching

TTS caching is configured in `lib/tts-cache.ts`:
- Cache directory: `cache/tts/`
- Cache key: SHA-256 hash of text + TTS options
- Cache hit detection: Automatic during job processing
- Cache benefits: 50% credit reduction for cached lines

### Sidechain Compression Settings

Sidechain compression settings are in `lib/audio-processor.ts`:
- Threshold: -20 dB
- Ratio: 4:1
- Attack: 20 ms
- Release: 250 ms
- Makeup gain: 0 dB

To adjust these, modify the default values in the `applySidechainCompression` function.

### Job Queue Settings

Job queue settings are in `lib/job-manager.ts`:
- Maximum concurrent jobs: 3
- Cleanup interval: 5 minutes
- File retention time: Files deleted after CDN upload

### Bunny Storage

Bunny Storage configuration:
- Storage zone: `dubber` (configured in `lib/bunny-storage.ts`)
- CDN URL: `https://dubber.b-cdn.net`
- File structure: `users/{userId}/jobs/{jobId}/`
- Automatic upload: Files uploaded to CDN after processing
- Local cleanup: Local files deleted after successful CDN upload

### InfluxDB Statistics

InfluxDB configuration (optional):
- Used for tracking TTS character usage against Google Cloud quota
- Measurement: `tts_characters`
- Fields: `characters` (integer)
- Tags: `userId`, `jobId`
- Query endpoint: `/api/stats/characters`

## Troubleshooting

### FFmpeg not found
Ensure FFmpeg is installed and available in your system PATH. Run `ffmpeg -version` to verify.

### Convex connection issues
- Ensure `NEXT_PUBLIC_CONVEX_URL` is set correctly in `.env.local`
- Run `npx convex dev` to start the Convex backend
- Check that Convex dashboard is accessible

### Authentication errors
- Clear browser cookies and try logging in again
- Ensure Convex Auth is properly configured
- Check browser console for authentication errors
- Verify `NEXT_PUBLIC_CONVEX_URL` is correct

### Google Cloud authentication error
- Verify your service account key path is correct in `.env.local`
- Ensure the service account has the "Cloud Text-to-Speech User" role
- Check that the Cloud Text-to-Speech API is enabled in your project
- Verify the JSON key file is valid and not corrupted

### File upload fails
- Check file size limits (max 100MB per file)
- Verify file formats are supported
- Check the browser console for error messages
- Ensure you have sufficient credits (check credit balance)
- Verify authentication token is valid

### Insufficient credits
- New users receive 100 free credits
- Check your credit balance in the dashboard
- View transaction history to see credit usage
- Cached TTS lines cost 0.5 credits (50% savings)

### Processing takes too long
- Long audio files with many subtitles will take longer to process
- Check Google Cloud quota limits
- Monitor job progress in the UI
- Maximum 3 concurrent jobs are processed

### Bunny CDN upload fails
- Verify `BUNNY_STORAGE_KEY` is set correctly
- Check Bunny.net dashboard for storage zone configuration
- Files will still be available via API download if CDN upload fails
- Check server logs for upload errors

### InfluxDB statistics not available
- InfluxDB is optional - statistics endpoint will return 503 if not configured
- Set `INFLUX_URL`, `INFLUX_TOKEN`, `INFLUX_ORG`, and `INFLUX_BUCKET` in `.env.local`
- Statistics are used for monitoring Google Cloud TTS quota usage

## Development

### Building for Production

```bash
npm run build
npm start
```

### Linting

```bash
npm run lint
```

## License

This project is licensed under the MIT License.

## Additional Services Setup

### Bunny Storage Setup (Optional but Recommended)

1. Create a Bunny.net account at [bunny.net](https://bunny.net)
2. Create a storage zone named `dubber`
3. Get your storage API key:
   - Go to Storage → dubber → FTP & API Access
   - Copy the "Password" (this is your API key)
4. Add to `.env.local`:
   ```env
   BUNNY_STORAGE_KEY=your-api-key-here
   ```

Files will be automatically uploaded to CDN after processing for fast global delivery.

### InfluxDB Setup (Optional)

InfluxDB is used for tracking TTS character usage statistics.

1. Install InfluxDB or use InfluxDB Cloud
2. Create a bucket named `auto-lektor` (or your preferred name)
3. Create an API token with write permissions
4. Add to `.env.local`:
   ```env
   INFLUX_URL=https://your-influxdb-url:8086
   INFLUX_TOKEN=your-influxdb-token
   INFLUX_ORG=your-organization
   INFLUX_BUCKET=auto-lektor
   ```

Statistics are available at `/api/stats/characters` endpoint.

## Architecture

### Backend
- **Convex**: Real-time database and backend functions
  - User authentication via Convex Auth
  - Job management and status tracking
  - Credit system with transaction logging
- **Next.js API Routes**: File upload, download, and authentication middleware
- **Google Cloud TTS**: Text-to-speech generation
- **FFmpeg**: Audio processing and mixing

### Frontend
- **Next.js 16**: React framework with App Router
- **Convex React**: Real-time data synchronization
- **Tailwind CSS**: Styling with dark mode support
- **TypeScript**: Type-safe development

### Storage
- **Bunny CDN**: Global CDN for generated audio files
- **Local Cache**: TTS audio cache for cost reduction
- **Temporary Storage**: Job files cleaned up after processing

### Monitoring
- **InfluxDB**: TTS character usage tracking
- **Convex Dashboard**: Real-time database monitoring

## License

This project is licensed under the MIT License.

## Acknowledgments

- [Next.js](https://nextjs.org) - React framework
- [Convex](https://convex.dev) - Backend-as-a-Service
- [Convex Auth](https://github.com/get-convex/convex-auth) - Authentication system
- [Google Cloud Text-to-Speech](https://cloud.google.com/text-to-speech) - TTS API
- [FFmpeg](https://ffmpeg.org) - Audio processing
- [fluent-ffmpeg](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg) - FFmpeg wrapper for Node.js
- [Bunny.net](https://bunny.net) - CDN and storage
- [InfluxDB](https://www.influxdata.com) - Time-series database for statistics
