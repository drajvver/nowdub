# Auto Dubbing Generator

An automatic dubbing generator application that uses Google Cloud Text-to-Speech to generate speech from SRT or VTT subtitles, then merges it with an original audio track using FFmpeg sidechain compression.

## Features

- Upload SRT or VTT subtitle files
- Upload original audio tracks (MP3, WAV, M4A, AAC, OGG, FLAC, WMA)
- Generate TTS audio from subtitles with proper timing
- Merge TTS audio with original audio using sidechain compression
- Download both plain TTS audio and merged audio
- Asynchronous job processing with progress tracking
- Automatic file cleanup after processing

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

3. Set up environment variables:
```bash
cp env.example .env.local
```

4. Edit `.env.local` and set the path to your Google Cloud service account key:
```env
GOOGLE_APPLICATION_CREDENTIALS=/path/to/your/service-account-key.json
```

## Running the Application

Start the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. **Upload Files**:
   - Select a subtitle file (.srt or .vtt)
   - Select an audio file (.mp3, .wav, .m4a, .aac, .ogg, .flac, or .wma)
   - Click "Start Processing"

2. **Monitor Progress**:
   - Jobs are processed asynchronously
   - View job status and progress in the Jobs section
   - The page automatically polls for updates every 2 seconds

3. **Download Results**:
   - Once a job is completed, download buttons will appear
   - "Download TTS Audio" - Plain generated speech audio
   - "Download Merged Audio" - TTS merged with original audio using sidechain compression

4. **Manage Jobs**:
   - Delete jobs using the trash icon
   - Files are automatically cleaned up after 1 hour

## Project Structure

```
app/
  api/
    upload/route.ts          # File upload endpoint
    jobs/route.ts            # List all jobs
    jobs/[id]/route.ts       # Get/delete specific job
    jobs/[id]/download/route.ts # Download generated files
  page.tsx                  # Main UI
lib/
  types.ts                  # TypeScript type definitions
  subtitle-parser.ts        # SRT/VTT parsing
  tts-generator.ts          # Google Cloud TTS integration
  audio-processor.ts        # FFmpeg audio processing
  job-manager.ts            # Job queue management
  utils.ts                  # Utility functions
```

## API Endpoints

### POST /api/upload
Upload subtitle and audio files to create a new job.

**Request:** `multipart/form-data`
- `subtitle`: Subtitle file (.srt or .vtt)
- `audio`: Audio file

**Response:**
```json
{
  "jobId": "uuid",
  "message": "Files uploaded successfully. Processing started."
}
```

### GET /api/jobs
List all jobs.

**Response:**
```json
[
  {
    "id": "uuid",
    "status": "completed",
    "progress": 100,
    "createdAt": "2025-01-01T00:00:00.000Z",
    "completedAt": "2025-01-01T00:05:00.000Z",
    "downloads": {
      "ttsAudio": "/api/jobs/uuid/download?type=tts",
      "mergedAudio": "/api/jobs/uuid/download?type=merged"
    }
  }
]
```

### GET /api/jobs/[id]
Get a specific job's status.

### DELETE /api/jobs/[id]
Delete a job and its files.

### GET /api/jobs/[id]/download?type=tts|merged
Download generated audio files.

## Configuration

### TTS Settings

Default TTS settings are configured in `lib/tts-generator.ts`:
- Language: English (en-US)
- Voice: en-US-Standard-B
- Audio encoding: MP3
- Speaking rate: 1.0 (normal speed)
- Pitch: 0.0 (normal pitch)

To customize these settings, modify the `DEFAULT_TTS_OPTIONS` constant.

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
- File retention time: 1 hour

## Troubleshooting

### FFmpeg not found
Ensure FFmpeg is installed and available in your system PATH. Run `ffmpeg -version` to verify.

### Google Cloud authentication error
- Verify your service account key path is correct in `.env.local`
- Ensure the service account has the "Cloud Text-to-Speech User" role
- Check that the Cloud Text-to-Speech API is enabled in your project

### File upload fails
- Check file size limits (max 100MB per file)
- Verify file formats are supported
- Check the browser console for error messages

### Processing takes too long
- Long audio files with many subtitles will take longer to process
- Check Google Cloud quota limits
- Monitor job progress in the UI

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

## Acknowledgments

- [Next.js](https://nextjs.org) - React framework
- [Google Cloud Text-to-Speech](https://cloud.google.com/text-to-speech) - TTS API
- [FFmpeg](https://ffmpeg.org) - Audio processing
- [fluent-ffmpeg](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg) - FFmpeg wrapper for Node.js
