import { SubtitleSegment, SilenceGap } from './types';

/**
 * Parse SRT timestamp format (00:00:00,000) to seconds
 */
function parseSRTTime(timeStr: string): number {
  const [time, ms] = timeStr.split(',');
  const [hours, minutes, seconds] = time.split(':').map(Number);
  return hours * 3600 + minutes * 60 + seconds + parseInt(ms) / 1000;
}

/**
 * Parse VTT timestamp format (00:00:00.000) to seconds
 */
function parseVTTTime(timeStr: string): number {
  const parts = timeStr.split(':');
  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts.map(Number);
    return hours * 3600 + minutes * 60 + seconds;
  } else if (parts.length === 2) {
    const [minutes, seconds] = parts.map(Number);
    return minutes * 60 + seconds;
  }
  return 0;
}

/**
 * Parse SRT subtitle file
 */
export function parseSRT(fileContent: string): SubtitleSegment[] {
  console.log('[PARSER] Parsing SRT file...');
  const segments: SubtitleSegment[] = [];
  
  // Remove BOM if present and normalize line endings
  let content = fileContent.replace(/^\uFEFF/, '').trim();
  content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // Split by double newlines (subtitle blocks)
  const blocks = content.split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    if (lines.length < 2) continue;

    // First line should be the index (numeric)
    const firstLine = lines[0];
    const index = parseInt(firstLine);
    if (isNaN(index)) {
      // If first line is not a number, it might be a timestamp (some SRT files skip index)
      // Try to parse it as timestamp instead
      const timeMatch = firstLine.match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);
      if (timeMatch) {
        const start = parseSRTTime(timeMatch[1]);
        const end = parseSRTTime(timeMatch[2]);
        const text = lines.slice(1).join('\n').trim();
        if (text) {
          segments.push({ start, end, text });
        }
      }
      continue;
    }

    // Second line should be the timestamp
    if (lines.length < 2) continue;
    const timeLine = lines[1];
    const timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);
    if (!timeMatch) continue;

    const start = parseSRTTime(timeMatch[1]);
    const end = parseSRTTime(timeMatch[2]);

    // Remaining lines are the text
    const text = lines.slice(2).join('\n').trim();

    if (text) {
      segments.push({ start, end, text });
    }
  }

  console.log(`[PARSER] Parsed ${segments.length} SRT segments`);
  return segments;
}

/**
 * Parse VTT subtitle file
 */
export function parseVTT(fileContent: string): SubtitleSegment[] {
  console.log('[PARSER] Parsing VTT file...');
  const segments: SubtitleSegment[] = [];
  const lines = fileContent.split('\n');
  
  let i = 0;
  // Skip WEBVTT header
  while (i < lines.length && !lines[i].includes('-->')) {
    i++;
  }

  while (i < lines.length) {
    const line = lines[i].trim();
    
    // Look for timestamp line
    if (line.includes('-->')) {
      const timeMatch = line.match(/(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/);
      if (!timeMatch) {
        i++;
        continue;
      }

      const start = parseVTTTime(timeMatch[1]);
      const end = parseVTTTime(timeMatch[2]);

      // Collect text lines
      i++;
      const textLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== '' && !lines[i].includes('-->')) {
        textLines.push(lines[i].trim());
        i++;
      }

      const text = textLines.join('\n').trim();
      if (text) {
        segments.push({ start, end, text });
      }
    } else {
      i++;
    }
  }

  console.log(`[PARSER] Parsed ${segments.length} VTT segments`);
  return segments;
}

/**
 * Calculate silence gaps between subtitle segments
 */
export function calculateSilenceGaps(segments: SubtitleSegment[]): SilenceGap[] {
  console.log('[PARSER] Calculating silence gaps...');
  const gaps: SilenceGap[] = [];

  // Sort segments by start time
  const sortedSegments = [...segments].sort((a, b) => a.start - b.start);

  for (let i = 0; i < sortedSegments.length - 1; i++) {
    const current = sortedSegments[i];
    const next = sortedSegments[i + 1];

    // Calculate gap between current end and next start
    const gapStart = current.end;
    const gapDuration = next.start - current.end;

    // Only add if there's a meaningful gap (at least 0.1 seconds)
    if (gapDuration > 0.1) {
      gaps.push({
        start: gapStart,
        duration: gapDuration,
      });
    }
  }

  console.log(`[PARSER] Found ${gaps.length} silence gaps`);
  return gaps;
}

/**
 * Detect subtitle format from content
 */
export function detectSubtitleFormat(fileContent: string): 'srt' | 'vtt' | 'unknown' {
  // Remove BOM if present
  const content = fileContent.replace(/^\uFEFF/, '');
  const trimmed = content.trim().toLowerCase();
  
  if (trimmed.startsWith('webvtt')) {
    return 'vtt';
  }
  
  // Normalize line endings to \n for consistent matching
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // Check for SRT pattern (number followed by timestamp with comma separator)
  // Pattern should match: number, newline, timestamp with comma (HH:MM:SS,mmm --> HH:MM:SS,mmm)
  // This pattern can appear anywhere in the file, not just at the start
  const srtPattern = /\d+\s*\n\s*\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/;
  if (srtPattern.test(normalized)) {
    return 'srt';
  }
  
  return 'unknown';
}

/**
 * Parse subtitle file (auto-detect format)
 */
export function parseSubtitleFile(fileContent: string): SubtitleSegment[] {
  const format = detectSubtitleFormat(fileContent);
  
  switch (format) {
    case 'srt':
      return parseSRT(fileContent);
    case 'vtt':
      return parseVTT(fileContent);
    default:
      throw new Error('Unknown subtitle format. Expected SRT or VTT. Got ' + format);
  }
}

