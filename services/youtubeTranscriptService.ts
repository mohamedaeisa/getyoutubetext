import { fallbackSpeechToText } from '../lib/youtube/fallbackSpeechToText';
import { extractVideoId } from '../lib/youtube/extractVideoId';
import { fetchCaptions } from '../lib/youtube/fetchCaptions';
import {
  AiEnhancements,
  Transcript,
  TranscriptRequest,
  TranscriptResponse,
} from '../types/transcript.types';

const CACHE_TTL_MS = 5 * 60 * 1000;
const transcriptCache = new Map<string, { data: TranscriptResponse; expiresAt: number }>();

function toTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, '0');
  const minutes = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  const millis = (ms % 1000).toString().padStart(3, '0');
  return `${hours}:${minutes}:${seconds},${millis}`;
}

function formatTranscript(transcript: Transcript, format: TranscriptRequest['outputFormat']) {
  switch (format) {
    case 'text':
      return transcript.segments.map((s) => s.text).join(' ');
    case 'timestamped':
      return transcript.segments.map((s) => `[${toTimestamp(s.startMs)}] ${s.text}`).join('\n');
    case 'srt':
      return transcript.segments
        .map(
          (s, i) =>
            `${i + 1}\n${toTimestamp(s.startMs)} --> ${toTimestamp(s.endMs)}\n${s.text}\n`
        )
        .join('\n');
    case 'markdown':
      return transcript.segments
        .map((s) => `- **${toTimestamp(s.startMs)}** ${s.text}`)
        .join('\n');
    case 'json':
    default:
      return transcript;
  }
}

async function generateAiEnhancements(
  transcript: Transcript,
  request: TranscriptRequest,
  signal?: AbortSignal
): Promise<AiEnhancements | undefined> {
  if (!request.withAiEnhancements) return undefined;

  const aiEndpoint = process.env.AI_ENHANCEMENTS_URL;
  const aiApiKey = process.env.AI_ENHANCEMENTS_API_KEY;

  if (!aiEndpoint || !aiApiKey) {
    return {
      summary: {
        [request.summaryLength ?? 'short']: transcript.segments.slice(0, 5).map((s) => s.text).join(' '),
      },
      keywords: [],
      topics: [],
    };
  }

  const response = await fetch(aiEndpoint, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${aiApiKey}`,
    },
    body: JSON.stringify({
      transcript: transcript.segments,
      language: transcript.language,
      summaryLength: request.summaryLength ?? 'short',
      translateTo: request.translationTargetLanguage,
      operations: [
        'detect_language',
        'translation',
        'summary',
        'topic_segmentation',
        'keywords',
        'chapter_detection',
        'qa_generator',
        'sentiment',
      ],
    }),
  });

  if (!response.ok) return undefined;
  return (await response.json()) as AiEnhancements;
}

export async function youtubeTranscriptService(
  request: TranscriptRequest,
  signal?: AbortSignal
): Promise<TranscriptResponse> {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  const videoId = extractVideoId(request.url);
  const cacheKey = `${videoId}:${request.language ?? 'auto'}:${Boolean(request.withAiEnhancements)}`;

  const cacheEntry = transcriptCache.get(cacheKey);
  if (cacheEntry && cacheEntry.expiresAt > Date.now()) {
    return {
      ...cacheEntry.data,
      meta: {
        ...cacheEntry.data.meta,
        requestId,
        cacheHit: true,
      },
    };
  }

  const captionResult = await fetchCaptions({
    videoId,
    preferredLanguage: request.language,
    signal,
  });

  const transcript =
    captionResult.transcript ??
    (await fallbackSpeechToText({
      videoId,
      preferredLanguage: request.language,
      signal,
    }));

  if (!transcript) {
    throw new Error('Transcript is unavailable for this video');
  }

  const aiEnhancements = await generateAiEnhancements(transcript, request, signal);
  const exportPayload = formatTranscript(transcript, request.outputFormat ?? 'json');

  const data: TranscriptResponse = {
    transcript,
    exportPayload,
    aiEnhancements,
    meta: {
      requestId,
      cacheHit: false,
      durationMs: Date.now() - startedAt,
      retries: captionResult.retries,
    },
  };

  transcriptCache.set(cacheKey, {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return data;
}
