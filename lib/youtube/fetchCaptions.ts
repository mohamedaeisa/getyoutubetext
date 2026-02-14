import { Transcript, TranscriptSegment } from '../../types/transcript.types';
import { logger } from '../../utils/logger';
import { withRetry } from '../../utils/retry';

interface CaptionTrack {
  id?: string;
  language: string;
  generated: boolean;
  baseUrl?: string;
}

interface FetchCaptionOptions {
  videoId: string;
  preferredLanguage?: string;
  signal?: AbortSignal;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function parseTimedtextXml(xml: string, language: string): TranscriptSegment[] {
  const textNodeRegex = /<text([^>]*)>([\s\S]*?)<\/text>/g;
  const attrRegex = /(\w+)="([^"]*)"/g;

  const segments: TranscriptSegment[] = [];
  let nodeMatch: RegExpExecArray | null;

  while ((nodeMatch = textNodeRegex.exec(xml))) {
    const attrs = nodeMatch[1] ?? '';
    const rawText = decodeHtmlEntities(nodeMatch[2] ?? '').replace(/\s+/g, ' ').trim();
    if (!rawText) continue;

    let start = 0;
    let duration = 0;

    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = attrRegex.exec(attrs))) {
      if (attrMatch[1] === 'start') start = Number(attrMatch[2]);
      if (attrMatch[1] === 'dur') duration = Number(attrMatch[2]);
    }

    const startMs = Math.round(start * 1000);
    const endMs = Math.round((start + duration) * 1000);

    segments.push({
      id: `${segments.length}-${startMs}`,
      text: rawText,
      startMs,
      endMs,
      language,
    });
  }

  return segments;
}

async function fetchYoutubeDataApiCaption(
  options: FetchCaptionOptions
): Promise<Transcript | null> {
  const apiKey = process.env.YOUTUBE_DATA_API_KEY;
  if (!apiKey) {
    logger.warn('YOUTUBE_DATA_API_KEY missing, skipping YouTube Data API source');
    return null;
  }

  const listUrl = new URL('https://www.googleapis.com/youtube/v3/captions');
  listUrl.searchParams.set('part', 'snippet');
  listUrl.searchParams.set('videoId', options.videoId);
  listUrl.searchParams.set('key', apiKey);

  const listResponse = await fetch(listUrl, { signal: options.signal, cache: 'no-store' });
  if (!listResponse.ok) {
    logger.warn('YouTube Data API list failed', { status: listResponse.status });
    return null;
  }

  const listJson = (await listResponse.json()) as {
    items?: Array<{ id: string; snippet: { language: string; trackKind?: string } }>;
  };

  const sorted = (listJson.items ?? []).sort((a, b) => {
    if (a.snippet.language === options.preferredLanguage) return -1;
    if (b.snippet.language === options.preferredLanguage) return 1;
    return 0;
  });

  const caption = sorted[0];
  if (!caption) return null;

  const downloadUrl = new URL(`https://www.googleapis.com/youtube/v3/captions/${caption.id}`);
  downloadUrl.searchParams.set('tfmt', 'ttml');
  downloadUrl.searchParams.set('key', apiKey);

  const downloadResponse = await fetch(downloadUrl, {
    signal: options.signal,
    cache: 'no-store',
    headers: { Authorization: `Bearer ${process.env.YOUTUBE_OAUTH_ACCESS_TOKEN ?? ''}` },
  });

  if (!downloadResponse.ok) {
    logger.warn('Caption download via Data API failed', { status: downloadResponse.status });
    return null;
  }

  const xml = await downloadResponse.text();
  const segments = parseTimedtextXml(xml, caption.snippet.language);
  if (!segments.length) return null;

  return {
    videoId: options.videoId,
    source: 'youtube-data-api',
    language: caption.snippet.language,
    generated: caption.snippet.trackKind === 'ASR',
    fetchedAt: new Date().toISOString(),
    segments,
  };
}

async function fetchTimedtextCaption(options: FetchCaptionOptions): Promise<Transcript | null> {
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(options.videoId)}`;
  const watchResponse = await fetch(watchUrl, {
    signal: options.signal,
    cache: 'no-store',
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EDUVA/1.0; +https://eduva.ai)' },
  });

  if (!watchResponse.ok) {
    return null;
  }

  const page = await watchResponse.text();
  const captionsJsonMatch = page.match(/"captionTracks":(\[[^\]]+\])/);
  if (!captionsJsonMatch) return null;

  const tracks = JSON.parse(captionsJsonMatch[1]) as Array<{
    baseUrl: string;
    languageCode: string;
    kind?: string;
  }>;

  if (!tracks.length) return null;

  const rankedTracks: CaptionTrack[] = tracks
    .map((track) => ({
      baseUrl: track.baseUrl,
      language: track.languageCode,
      generated: track.kind === 'asr',
    }))
    .sort((a, b) => {
      if (a.language === options.preferredLanguage) return -1;
      if (b.language === options.preferredLanguage) return 1;
      if (!a.generated && b.generated) return -1;
      if (a.generated && !b.generated) return 1;
      return 0;
    });

  const selected = rankedTracks[0];
  if (!selected.baseUrl) return null;

  const captionResponse = await fetch(`${selected.baseUrl}&fmt=srv3`, {
    signal: options.signal,
    cache: 'no-store',
  });

  if (!captionResponse.ok) return null;

  const xml = await captionResponse.text();
  const segments = parseTimedtextXml(xml, selected.language);
  if (!segments.length) return null;

  return {
    videoId: options.videoId,
    source: 'timedtext',
    language: selected.language,
    generated: selected.generated,
    fetchedAt: new Date().toISOString(),
    segments,
  };
}

export async function fetchCaptions(options: FetchCaptionOptions): Promise<{
  transcript: Transcript | null;
  retries: number;
}> {
  const dataApiAttempt = await withRetry(() => fetchYoutubeDataApiCaption(options), {
    retries: 2,
    signal: options.signal,
    shouldRetry: (error) => !(error instanceof Error && /aborted/i.test(error.message)),
  });

  if (dataApiAttempt.result) {
    return { transcript: dataApiAttempt.result, retries: dataApiAttempt.attempts - 1 };
  }

  const timedtextAttempt = await withRetry(() => fetchTimedtextCaption(options), {
    retries: 2,
    signal: options.signal,
  });

  return {
    transcript: timedtextAttempt.result,
    retries: dataApiAttempt.attempts + timedtextAttempt.attempts - 2,
  };
}
