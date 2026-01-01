declare module 'fluent-ffmpeg' {
  import { Readable } from 'stream';

  export interface FfmpegCommand {
    input(source: string | Readable): FfmpegCommand;
    inputFormat(format: string): FfmpegCommand;
    inputOptions(options: string[]): FfmpegCommand;
    output(target: string): FfmpegCommand;
    outputOptions(options: string[]): FfmpegCommand;
    audioCodec(codec: string): FfmpegCommand;
    audioFrequency(freq: number): FfmpegCommand;
    audioChannels(channels: number): FfmpegCommand;
    audioBitrate(bitrate: string): FfmpegCommand;
    audioFilter(filter: string): FfmpegCommand;
    complexFilter(filters: string[]): FfmpegCommand;
    videoCodec(codec: string): FfmpegCommand;
    on(event: 'start' | 'error' | 'end' | 'progress', handler: (...args: any[]) => void): FfmpegCommand;
    save(filePath: string): FfmpegCommand;
  }

  export interface FfmpegCommandStatic {
    (source?: string | Readable): FfmpegCommand;
    setFfmpegPath(path: string): void;
    setFfprobePath(path: string): void;
    getAvailableFormats(callback: (err: Error | null, formats: any) => void): void;
    getAvailableCodecs(callback: (err: Error | null, codecs: any) => void): void;
    getAvailableEncoders(callback: (err: Error | null, encoders: any) => void): void;
    getAvailableFilters(callback: (err: Error | null, filters: any) => void): void;
  }

  export const ffmpeg: FfmpegCommandStatic;
  export const ffprobe: (filePath: string, callback: (err: Error | null, metadata: any) => void) => void;
}
