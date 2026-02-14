export type CaptionSource =
  | 'youtube-data-api'
  | 'timedtext'
  | 'speech-to-text';

export interface TranscriptSegment {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  language: string;
  confidence?: number;
}

export interface Transcript {
  videoId: string;
  source: CaptionSource;
  language: string;
  generated: boolean;
  segments: TranscriptSegment[];
  fetchedAt: string;
}

export interface AiEnhancements {
  summary?: {
    short?: string;
    medium?: string;
    long?: string;
  };
  topics?: string[];
  keywords?: string[];
  chapters?: Array<{
    title: string;
    startMs: number;
    endMs?: number;
  }>;
  qa?: Array<{
    question: string;
    answer: string;
  }>;
  sentiment?: 'positive' | 'neutral' | 'negative';
  translatedText?: string;
  detectedLanguage?: string;
}

export interface TranscriptRequest {
  url: string;
  language?: string;
  withAiEnhancements?: boolean;
  summaryLength?: 'short' | 'medium' | 'long';
  translationTargetLanguage?: string;
  outputFormat?: 'text' | 'timestamped' | 'json' | 'srt' | 'markdown';
}

export interface TranscriptResponse {
  transcript: Transcript;
  exportPayload: string | Transcript;
  aiEnhancements?: AiEnhancements;
  meta: {
    requestId: string;
    cacheHit: boolean;
    durationMs: number;
    retries: number;
  };
}
