'use client';

import { useCallback, useRef, useState } from 'react';
import { TranscriptRequest, TranscriptResponse } from '../types/transcript.types';

export function useYoutubeTranscript() {
  const [data, setData] = useState<TranscriptResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (request: TranscriptRequest) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/youtube-transcript', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      const payload = (await response.json()) as TranscriptResponse | { error: string };

      if (!response.ok) {
        throw new Error('error' in payload ? payload.error : 'Failed to extract transcript');
      }

      setData(payload as TranscriptResponse);
      return payload as TranscriptResponse;
    } catch (caught) {
      if ((caught as Error).name !== 'AbortError') {
        setError((caught as Error).message || 'Failed to extract transcript');
      }
      throw caught;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
  }, []);

  return { data, isLoading, error, run, abort };
}
