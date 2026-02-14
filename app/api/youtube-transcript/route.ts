import { NextRequest, NextResponse } from 'next/server';
import { youtubeTranscriptService } from '../../../services/youtubeTranscriptService';
import { TranscriptRequest } from '../../../types/transcript.types';
import { logger } from '../../../utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;

function getClientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const existing = rateLimitStore.get(ip);

  if (!existing || existing.resetAt < now) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  existing.count += 1;
  if (existing.count > RATE_LIMIT_MAX) {
    return true;
  }

  return false;
}

function validateInput(body: unknown): TranscriptRequest {
  if (!body || typeof body !== 'object') {
    throw new Error('Request body must be an object');
  }

  const payload = body as Partial<TranscriptRequest>;

  if (typeof payload.url !== 'string') {
    throw new Error('url is required');
  }

  if (payload.language && !/^[a-z]{2,3}(-[A-Z]{2})?$/.test(payload.language)) {
    throw new Error('language format is invalid');
  }

  return {
    url: payload.url,
    language: payload.language,
    withAiEnhancements: Boolean(payload.withAiEnhancements),
    summaryLength: payload.summaryLength,
    translationTargetLanguage: payload.translationTargetLanguage,
    outputFormat: payload.outputFormat,
  };
}

function streamLargeResponse(payload: object): Response {
  const encoder = new TextEncoder();
  const chunks = JSON.stringify(payload, null, 0).match(/.{1,8192}/g) ?? [];

  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Transfer-Encoding': 'chunked',
    },
  });
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const requestId = crypto.randomUUID();
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 55_000);

  try {
    const body = validateInput(await request.json());
    const data = await youtubeTranscriptService(body, abortController.signal);

    if (data.transcript.segments.length > 500) {
      return streamLargeResponse({
        ...data,
        meta: { ...data.meta, requestId, backgroundSuggested: true },
      });
    }

    return NextResponse.json(
      {
        ...data,
        meta: { ...data.meta, requestId },
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    logger.error('Transcript extraction failed', {
      requestId,
      message: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown server error',
      },
      { status: 400 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
