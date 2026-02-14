import { Transcript, TranscriptSegment } from '../../types/transcript.types';

interface SpeechToTextOptions {
  videoId: string;
  preferredLanguage?: string;
  signal?: AbortSignal;
}

interface SpeechApiWord {
  word: string;
  startTimeMs: number;
  endTimeMs: number;
  confidence?: number;
}

function wordsToSegments(words: SpeechApiWord[], language: string): TranscriptSegment[] {
  const chunkSize = 18;
  const segments: TranscriptSegment[] = [];

  for (let i = 0; i < words.length; i += chunkSize) {
    const batch = words.slice(i, i + chunkSize);
    const startMs = batch[0]?.startTimeMs ?? 0;
    const endMs = batch[batch.length - 1]?.endTimeMs ?? startMs;

    segments.push({
      id: `${i / chunkSize}-${startMs}`,
      text: batch.map((w) => w.word).join(' ').trim(),
      startMs,
      endMs,
      language,
      confidence:
        batch.reduce((acc, current) => acc + (current.confidence ?? 1), 0) / Math.max(batch.length, 1),
    });
  }

  return segments;
}

export async function fallbackSpeechToText(
  options: SpeechToTextOptions
): Promise<Transcript | null> {
  const extractorUrl = process.env.YOUTUBE_AUDIO_EXTRACTOR_URL;
  const speechApiUrl = process.env.SPEECH_TO_TEXT_URL;
  const speechApiKey = process.env.SPEECH_TO_TEXT_API_KEY;

  if (!extractorUrl || !speechApiUrl || !speechApiKey) {
    return null;
  }

  const audioRes = await fetch(`${extractorUrl}?videoId=${encodeURIComponent(options.videoId)}`, {
    signal: options.signal,
    cache: 'no-store',
  });

  if (!audioRes.ok) return null;

  const { audioUrl } = (await audioRes.json()) as { audioUrl?: string };
  if (!audioUrl) return null;

  const sttResponse = await fetch(speechApiUrl, {
    method: 'POST',
    signal: options.signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${speechApiKey}`,
    },
    body: JSON.stringify({
      audioUrl,
      language: options.preferredLanguage,
      diarization: false,
      timestamps: true,
    }),
  });

  if (!sttResponse.ok) return null;

  const sttJson = (await sttResponse.json()) as {
    language?: string;
    words?: SpeechApiWord[];
  };

  const words = sttJson.words ?? [];
  if (!words.length) return null;

  const language = sttJson.language ?? options.preferredLanguage ?? 'en';
  const segments = wordsToSegments(words, language);

  return {
    videoId: options.videoId,
    source: 'speech-to-text',
    language,
    generated: true,
    fetchedAt: new Date().toISOString(),
    segments,
  };
}
